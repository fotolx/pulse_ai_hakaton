const sensors = [['Дымовой',0],['Тепловой',1],['Газоанализатор',1],['Метан',0],['Затопление',0],['КД Дверь',0],['Движение',0],['Температура',0],['Фаза',0],['ИБП',0],['Вентилятор',0],['Переключатель',0],['Насос осн.',0],['Режим насоса',0],['Реле',0],['Извещатель',0],['УИР-Р',0]];
const limit = (name, label) => `<label class="model-settings__threshold"><span>${label}</span><span class="model-settings__number"><input type="number" name="${name}" min="0" max="100" step="1" placeholder="0%" aria-label="${label}, процентов"></span></label>`;

export function mountModelSettings() {
  const settings = document.createElement('dialog');
  const auth = document.createElement('dialog');
  settings.className = 'model-settings';
  settings.id = 'model-settings-dialog';
  settings.setAttribute('aria-labelledby', 'model-settings-title');
  settings.innerHTML = `<form class="model-settings__panel" method="dialog">
    <button class="model-settings__close" type="button" data-dialog-close aria-label="Закрыть настройку модели" title="Закрыть">×</button>
    <h2 class="model-settings__title" id="model-settings-title" tabindex="-1">Настройка модели прогноза</h2>
    <div class="model-settings__metrics" aria-label="Показатели модели"><div><strong>Обучение</strong><span>19.09, 13:10</span></div><div><strong>Precision / Recall</strong><span>0.74 / 0.58</span></div><div><strong>Точность</strong><span>+2.8%</span></div></div>
    <fieldset class="model-settings__thresholds"><legend>Ключевые датчики (6)</legend><div>${limit('fire','Пожар')}${limit('flood','Подтопление')}${limit('access','Несанкц. доступ')}</div><div>${limit('failure','Отказ датчика')}${limit('maintenance','Плановое ТО')}${limit('cascade','Каскадный риск')}</div></fieldset>
    <section class="model-settings__sensors" aria-labelledby="model-settings-sensors-title">
      <button class="model-settings__section-toggle" type="button" aria-expanded="true" aria-controls="model-settings-sensors-list"><span id="model-settings-sensors-title">Все датчики модели</span><i aria-hidden="true"></i></button>
      <div class="model-settings__sensor-list" id="model-settings-sensors-list">${sensors.map(([name,active]) => `<button class="model-settings__tag${active?' model-settings__tag--active':''}" type="button" aria-pressed="${Boolean(active)}"><span>${name}</span><i aria-hidden="true">×</i></button>`).join('')}</div>
    </section>
    <label class="model-settings__sensitivity"><span>Чувствительность модели</span><span class="model-settings__range-line"><input type="range" name="sensitivity" min="0.2" max="100" step="0.01" value="3.58" aria-label="Чувствительность модели"><span class="model-settings__number model-settings__number--sensitivity"><input type="number" name="sensitivityValue" min="0.2" max="100" value="3.58" step="0.01" inputmode="decimal" aria-label="Значение чувствительности"></span></span><span class="model-settings__range-labels"><small>0.2 · менее чувствительна</small><small>100 · более чувствительна</small></span></label>
    <label class="model-settings__comment"><span>Комментарий</span><textarea name="comment" maxlength="1000" rows="2" placeholder="После изменения модели обновился расчёт ETA. Просьба проверить корректность и расхождение с фактическими данными."></textarea><span class="model-settings__comment-meta"><small>Начните вводить текст, а формат подстроится автоматически</small><small><output>56</output>/1000</small></span></label>
    <div class="model-settings__actions"><button class="model-settings__button model-settings__button--primary" type="button" data-train>Дообучить модель <span aria-hidden="true">✓</span></button><button class="model-settings__button" value="save">Сохранить пороги</button><button class="model-settings__button" type="button" data-close>Отменить изменения</button></div>
  </form>`;

  auth.className = 'pulse-auth';
  auth.id = 'pulse-ai-dialog';
  auth.setAttribute('aria-labelledby', 'pulse-ai-title');
  auth.innerHTML = `<form class="pulse-auth__panel" method="dialog">
    <button class="pulse-auth__close" type="button" data-dialog-close aria-label="Закрыть окно Пульс AI" title="Закрыть">×</button>
    <h2 id="pulse-ai-title" tabindex="-1">Пульс AI</h2><p class="pulse-auth__subtitle">Дообучение модели</p>
    <div class="pulse-auth__tabs" role="tablist" aria-label="Способ авторизации"><button type="button" role="tab" aria-selected="true" data-tab="password">Пароль</button><button type="button" role="tab" aria-selected="false" data-tab="qr">QR-авторизация</button><button type="button" role="tab" aria-selected="false" data-tab="signature">ЭЦП</button><button type="button" role="tab" aria-selected="false" data-tab="biometry">Биометрия</button></div>
    <div class="pulse-auth__tab-panel" role="tabpanel" data-panel="password"><label><span>Почта</span><span class="pulse-auth__input"><input type="email" name="email" autocomplete="username"><button type="button" data-clear aria-label="Очистить почту">×</button></span></label><label><span>Пароль</span><span class="pulse-auth__input"><input type="password" name="password" autocomplete="current-password"><button type="button" data-password aria-label="Показать пароль"><i aria-hidden="true"></i></button></span></label><div class="pulse-auth__options"><label><input type="checkbox" name="remember" checked><span>Пароль</span><i title="Сохранить пароль">?</i></label><a href="#password-reset">Забыли пароль?</a></div><button class="pulse-auth__submit" value="login">Войти</button></div>
    <div class="pulse-auth__alternative" role="tabpanel" data-panel="alternative" hidden>Выберите доступный способ авторизации и следуйте инструкциям системы.</div>
  </form>`;
  document.body.append(settings, auth);
  const sensorList = settings.querySelector('.model-settings__sensor-list');
  const toggle = settings.querySelector('.model-settings__section-toggle');
  const textarea = settings.querySelector('textarea');
  const counter = settings.querySelector('output');
  const sensitivityRange = settings.querySelector('input[type="range"][name="sensitivity"]');
  const sensitivityNumber = settings.querySelector('input[name="sensitivityValue"]');
  let opener;
  settings.querySelector('[data-close]').addEventListener('click', () => settings.close());
  for (const dialog of [settings, auth]) dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
  sensitivityRange.addEventListener('input', () => { sensitivityNumber.value = sensitivityRange.value; });
  sensitivityNumber.addEventListener('input', () => {
    if (sensitivityNumber.value === '') return;
    const value = Number(sensitivityNumber.value);
    if (Number.isFinite(value)) sensitivityRange.value = String(Math.min(100, Math.max(0.2, value)));
  });
  sensitivityNumber.addEventListener('change', () => {
    const value = Number(sensitivityNumber.value);
    const normalized = Number.isFinite(value) ? Math.min(100, Math.max(0.2, value)) : Number(sensitivityRange.value);
    sensitivityRange.value = String(normalized);
    sensitivityNumber.value = Number(normalized.toFixed(2)).toString();
  });
  settings.querySelector('[data-train]').addEventListener('click', () => { settings.close(); auth.showModal(); auth.querySelector('h2').focus(); });
  toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') === 'true'; toggle.setAttribute('aria-expanded', String(!open)); sensorList.hidden = open; });
  sensorList.addEventListener('click', e => { const tag=e.target.closest('.model-settings__tag'); if(!tag)return; const active=tag.getAttribute('aria-pressed')!=='true'; tag.setAttribute('aria-pressed',String(active)); tag.classList.toggle('model-settings__tag--active',active); });
  textarea.addEventListener('input', () => { counter.value = textarea.value.length || 56; });
  auth.querySelector('[data-clear]').addEventListener('click', () => { const input=auth.querySelector('[name="email"]'); input.value=''; input.focus(); });
  auth.querySelector('[data-password]').addEventListener('click', e => { const input=auth.querySelector('[name="password"]'); const shown=input.type==='text'; input.type=shown?'password':'text'; e.currentTarget.setAttribute('aria-label',shown?'Показать пароль':'Скрыть пароль'); });
  auth.querySelector('.pulse-auth__tabs').addEventListener('click', e => { const tab=e.target.closest('[role="tab"]'); if(!tab)return; auth.querySelectorAll('[role="tab"]').forEach(x=>x.setAttribute('aria-selected',String(x===tab))); const password=tab.dataset.tab==='password'; auth.querySelector('[data-panel="password"]').hidden=!password; auth.querySelector('[data-panel="alternative"]').hidden=password; });
  for(const dialog of [settings,auth]) dialog.addEventListener('click',e=>{ if(e.target!==dialog)return; const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close(); });
  settings.addEventListener('close',()=>{if(!auth.open)opener?.focus();}); auth.addEventListener('close',()=>opener?.focus());
  return { open(trigger=document.activeElement){if(settings.open||auth.open)return;opener=trigger;settings.showModal();settings.querySelector('h2').focus();}, destroy(){settings.remove();auth.remove();} };
}
