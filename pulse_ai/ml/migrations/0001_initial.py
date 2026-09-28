from django.db import migrations

class Migration(migrations.Migration):
    dependencies = []
    
    operations = [
        migrations.RunSQL("""
            CREATE TABLE ml_predictions (
                id BIGSERIAL PRIMARY KEY,
                entity_id VARCHAR(100) NOT NULL,
                model_name VARCHAR(20) NOT NULL,
                prediction_time TIMESTAMPTZ NOT NULL,
                probability DOUBLE PRECISION NOT NULL,
                label SMALLINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- BRIN-индекс для временных данных
            CREATE INDEX idx_ml_predictions_time_brin 
            ON ml_predictions USING BRIN (prediction_time);
            
            CREATE INDEX idx_ml_predictions_model_time 
            ON ml_predictions (model_name, prediction_time);
            
            CREATE INDEX idx_ml_predictions_entity 
            ON ml_predictions (entity_id, model_name);
            
            -- Гипертаблица TimescaleDB (опционально, для больших объёмов)
            SELECT create_hypertable(
                'ml_predictions', 'prediction_time',
                migrate_data => true
            );
        """),
    ]