"""
Имитатор внешней диспетчерской системы для pulse_ai.

Читает CSV-журнал (схема: ид_события, ид_канала_данных, дата, время,
тревожное, значение_датчика) ОДИН РАЗ, чанками (память ограничена
размером одного чанка вне зависимости от размера файла на диске).
Файл содержит данные за весь календарный год, включая ещё не наступившие
("будущие") события.

Логика на каждую строку — сравнение её occurred_at с реальным текущим
временем в момент обработки:

  - occurred_at <= сейчас  -> строка "историческая": копится в батч и
    отправляется максимально быстро, без ожидания. Так весь уже
    прошедший период загружается сразу при старте скрипта.

  - occurred_at > сейчас   -> строка "будущая": как только встретилась
    первая такая строка, скрипт переключается в режим реального времени.
    Строки с ОДИНАКОВОЙ меткой времени (несколько одновременных событий
    с одного датчика) группируются и отправляются одним запросом ровно
    в момент, когда настенные часы доходят до этой метки — не раньше.

Ни разгон по фиксированному темпу (события/сутки), ни повторное чтение
файла не используются — объём событий в разные дни может быть каким
угодно, скрипт просто идёт по факту наступления времени.

Чекпоинт — количество успешно отправленных строк — сохраняется в
state-файле после каждой успешной отправки. При перезапуске уже
отправленные строки не отправляются повторно (файл лишь заново
прочитывается и отбрасывается до нужной позиции — дёшево по памяти).
Если процесс был остановлен надолго и часть "будущих" строк к моменту
перезапуска уже фактически стала "историческими" — они корректно
досылаются быстро, без искусственного ожидания задним числом.

Устойчивость к недоступности API: при сетевой ошибке или не-201 ответе
батч не считается отправленным, чекпоинт не продвигается — скрипт уходит
в повтор с экспоненциальной задержкой (потолок MAX_RETRY_DELAY), пока
сервер не восстановится. Данные не теряются и не дублируются.

Запуск:
    python sensor_stream_simulator.py \
        --csv journal_2025_unique.csv \
        --api-url http://localhost:8125/api/events/ingest/ \
        --api-key mysecret

Остановка — Ctrl+C или SIGTERM (docker stop): чекпоинт к моменту
остановки уже сохранён, можно перезапускать в любой момент.
"""
import argparse
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime

import pandas as pd
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

COLUMN_MAP = {
    "ид_события": "event_id",
    "ид_канала_данных": "channel_id",
    "дата": "date",
    "время": "time",
    "тревожное": "alarm",
    "значение_датчика": "value",
}

INITIAL_RETRY_DELAY = 2.0
MAX_RETRY_DELAY = 60.0


def _to_bool_tf(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("t", "true", "1", "да")


class SensorStreamSimulator:
    def __init__(
        self,
        csv_path,
        api_url,
        api_key=None,
        state_file="stream_state.json",
        read_chunk_size=10_000,
        past_batch_size=2_000,
    ):
        self.csv_path = csv_path
        self.api_url = api_url
        self.api_key = api_key
        self.state_file = state_file
        self.read_chunk_size = read_chunk_size
        self.past_batch_size = past_batch_size

        self.state = self._load_state()
        self._stopping = False
        signal.signal(signal.SIGINT, self._handle_stop)
        signal.signal(signal.SIGTERM, self._handle_stop)

        self._past_batch = []
        self._future_group = []
        self._future_group_time = None

    # ------------------------------------------------------------------ #
    def _handle_stop(self, sig, frame):
        logger.info("Получен сигнал остановки — завершаемся, чекпоинт уже сохранён после последней успешной отправки...")
        self._stopping = True

    def _load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.error(f"Не удалось прочитать файл состояния, начинаем заново: {e}")
        return {"rows_sent": 0}

    def _save_state(self):
        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(self.state, f)
        except OSError as e:
            logger.error(f"Не удалось сохранить файл состояния: {e}")

    def _sleep_interruptible(self, seconds):
        deadline = time.monotonic() + seconds
        while not self._stopping and time.monotonic() < deadline:
            time.sleep(min(1.0, deadline - time.monotonic()))

    # ------------------------------------------------------------------ #
    def _row_to_payload(self, row):
        occurred_at = datetime.strptime(f"{row.date} {row.time}", "%Y-%m-%d %H:%M:%S")
        return {
            "source_event_id": int(row.event_id),
            "channel_id": int(row.channel_id),
            "occurred_at": occurred_at.strftime("%Y-%m-%d %H:%M:%S"),
            "is_alarm": _to_bool_tf(row.alarm),
            "raw_value": str(row.value),
        }, occurred_at

    def _post_with_retry(self, events, label):
        """
        Отправляет events. При сбое (сеть/не-201) повторяет с экспоненциальной
        задержкой бесконечно, пока не остановят или пока не получится.
        Возвращает True при успехе, False — если остановлено во время ретраев.
        """
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        delay = INITIAL_RETRY_DELAY
        attempt = 1

        while not self._stopping:
            try:
                response = requests.post(
                    self.api_url, json={"events": events}, headers=headers, timeout=15
                )
            except requests.exceptions.RequestException as e:
                logger.error(f"[{label}] попытка {attempt}: сеть недоступна ({e})")
            else:
                if response.status_code == 201:
                    data = response.json()
                    logger.info(
                        f"[{label}] отправлено {len(events)}: принято {data.get('accepted_for_insert')}, "
                        f"пропущено (канал не найден) {data.get('skipped_unknown_channel')}"
                    )
                    if data.get("validation_errors"):
                        logger.warning(
                            f"[{label}] ошибки валидации (не будут повторены): {data['validation_errors'][:5]}"
                        )
                    return True
                logger.warning(f"[{label}] попытка {attempt}: сервер вернул {response.status_code}: {response.text[:300]}")

            logger.info(f"[{label}] повтор через {delay:.0f} сек...")
            self._sleep_interruptible(delay)
            delay = min(delay * 2, MAX_RETRY_DELAY)
            attempt += 1

        logger.info(f"[{label}] остановлено во время повторных попыток — чекпоинт не продвинут")
        return False

    # ------------------------------------------------------------------ #
    def _flush_past_batch(self):
        if not self._past_batch:
            return True
        n = len(self._past_batch)
        if not self._post_with_retry(self._past_batch, f"историч. батч ({n})"):
            return False
        self.state["rows_sent"] += n
        self._save_state()
        self._past_batch = []
        return True

    def _flush_future_group(self):
        if not self._future_group:
            return True
        now = datetime.now()
        wait = (self._future_group_time - now).total_seconds()
        if wait > 0:
            logger.info(
                f"Ожидание {wait:.1f} сек до {self._future_group_time} "
                f"({len(self._future_group)} событий в группе)..."
            )
            self._sleep_interruptible(wait)
            if self._stopping:
                return False

        n = len(self._future_group)
        label = f"группа @ {self._future_group_time} ({n})"
        if not self._post_with_retry(self._future_group, label):
            return False
        self.state["rows_sent"] += n
        self._save_state()
        self._future_group = []
        self._future_group_time = None
        return True

    # ------------------------------------------------------------------ #
    def run(self):
        rows_to_skip = self.state.get("rows_sent", 0)
        if rows_to_skip:
            logger.info(
                f"Возобновляем: пропускаем уже отправленные {rows_to_skip} строк "
                f"(файл перечитывается с начала, но повторно не отправляется)"
            )

        try:
            reader = pd.read_csv(self.csv_path, encoding="utf-8", chunksize=self.read_chunk_size)
        except FileNotFoundError:
            logger.error(f"CSV файл не найден: {self.csv_path}")
            sys.exit(1)

        rows_seen = 0
        entered_future_phase = False

        for chunk in reader:
            if self._stopping:
                break
            chunk = chunk.rename(columns=COLUMN_MAP)

            for row in chunk.itertuples(index=False):
                rows_seen += 1
                if rows_seen <= rows_to_skip:
                    continue

                payload, occurred_at = self._row_to_payload(row)
                now = datetime.now()

                if occurred_at <= now:
                    if entered_future_phase:
                        # Файл оказался не строго отсортирован по времени —
                        # эта строка "опоздала" и попалась уже после того,
                        # как мы начали ждать будущие метки. Отправляем её
                        # немедленно вне очереди, не ломая уже идущее ожидание.
                        logger.warning(
                            f"Строка с прошедшей датой {occurred_at} встретилась после "
                            f"начала режима реального времени — CSV не строго "
                            f"отсортирован по времени. Отправляем вне очереди."
                        )
                        if not self._post_with_retry([payload], f"внеочередная строка @ {occurred_at}"):
                            return
                        self.state["rows_sent"] += 1
                        self._save_state()
                        continue

                    self._past_batch.append(payload)
                    if len(self._past_batch) >= self.past_batch_size:
                        if not self._flush_past_batch():
                            return
                else:
                    if not entered_future_phase:
                        if not self._flush_past_batch():
                            return
                        entered_future_phase = True
                        logger.info(
                            f"Исторические данные загружены полностью. "
                            f"Переходим в режим реального времени начиная с {occurred_at}."
                        )

                    if self._future_group_time is None:
                        self._future_group_time = occurred_at

                    if occurred_at == self._future_group_time:
                        self._future_group.append(payload)
                    elif occurred_at < self._future_group_time:
                        logger.warning(
                            f"Нарушен порядок будущих событий: {occurred_at} раньше уже "
                            f"формируемой группы {self._future_group_time} — CSV не строго "
                            f"отсортирован. Строка будет отправлена вместе с текущей группой."
                        )
                        self._future_group.append(payload)
                    else:
                        if not self._flush_future_group():
                            return
                        self._future_group_time = occurred_at
                        self._future_group.append(payload)

        if self._stopping:
            logger.info("Остановлено. Чекпоинт сохранён — при перезапуске продолжится с этого места.")
            return

        if not self._flush_past_batch():
            return
        if not self._flush_future_group():
            return

        logger.info(
            f"Файл полностью обработан, все строки отправлены (всего {self.state['rows_sent']}). "
            f"Повторное чтение не требуется — скрипт завершает работу."
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Имитатор потока событий датчиков для pulse_ai")
    parser.add_argument("--csv", required=True, help="Путь к CSV-файлу журнала")
    parser.add_argument("--api-url", required=True, help="URL эндпоинта приёма, например http://localhost:8125/api/events/ingest/")
    parser.add_argument("--api-key", default=os.environ.get("INGEST_API_KEY"), help="Значение заголовка X-API-Key (или переменная окружения INGEST_API_KEY)")
    parser.add_argument("--state-file", default="stream_state.json", help="Файл для хранения чекпоинта между перезапусками")
    parser.add_argument("--read-chunk-size", type=int, default=10_000, help="Строк CSV, читаемых за один раз с диска (не влияет на размер запросов к API)")
    parser.add_argument("--past-batch-size", type=int, default=2_000, help="Сколько исторических строк накапливать перед отправкой одним запросом")
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.exists(args.csv):
        logger.error(f"CSV файл не найден: {args.csv}")
        sys.exit(1)

    simulator = SensorStreamSimulator(
        csv_path=args.csv,
        api_url=args.api_url,
        api_key=args.api_key,
        state_file=args.state_file,
        read_chunk_size=args.read_chunk_size,
        past_batch_size=args.past_batch_size,
    )
    simulator.run()


if __name__ == "__main__":
    main()
