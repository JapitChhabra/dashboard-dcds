from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
import config
import pymysql
import logging
from decimal import Decimal
import traceback
import sys

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Replace MySQL connection with PyMySQL
pymysql.install_as_MySQLdb()

app = Flask(__name__)
app.config.from_object(config)
db = SQLAlchemy(app)

# Custom JSON encoder to handle Decimal types
class CustomJSONEncoder(Flask.json_encoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)

app.json_encoder = CustomJSONEncoder

@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/tables')
def get_tables():
    try:
        logger.debug("Attempting to connect to database...")
        inspector = inspect(db.engine)
        tables = []
        
        logger.debug("Getting table names...")
        table_names = inspector.get_table_names()
        logger.debug(f"Found tables: {table_names}")
        
        for table_name in table_names:
            try:
                columns = []
                for column in inspector.get_columns(table_name):
                    columns.append({
                        'name': column['name'],
                        'type': str(column['type']),
                        'nullable': column['nullable']
                    })
                
                tables.append({
                    'name': table_name,
                    'columns': columns
                })
                logger.debug(f"Processed table {table_name} with columns: {columns}")
            except Exception as e:
                logger.error(f"Error processing table {table_name}: {str(e)}")
                logger.error(traceback.format_exc())
        
        return jsonify(tables)
    except Exception as e:
        logger.error(f"Error fetching tables: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/debug-info')
def debug_info():
    try:
        # Test database connection
        db.session.execute(text('SELECT 1'))
        db_status = "Connected"
    except Exception as e:
        db_status = f"Error: {str(e)}"

    info = {
        "database_url": app.config['SQLALCHEMY_DATABASE_URI'],
        "database_status": db_status,
        "tables": [],
    }
    
    try:
        inspector = inspect(db.engine)
        info["tables"] = inspector.get_table_names()
    except Exception as e:
        info["tables_error"] = str(e)

    return jsonify(info)

@app.route('/api/table/<table_name>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def handle_table_data(table_name):
    try:
        if request.method == 'GET':
            sql = text(f'SELECT * FROM `{table_name}`')
            result = db.session.execute(sql)
            columns = result.keys()
            
            data = []
            for row in result.fetchall():
                row_dict = {}
                for column, value in zip(columns, row):
                    if isinstance(value, Decimal):
                        row_dict[column] = str(value)
                    else:
                        row_dict[column] = value
                data.append(row_dict)
                
            return jsonify(data)

        elif request.method == 'POST':
            data = request.json
            columns = ', '.join(f'`{k}`' for k in data.keys())
            placeholders = ', '.join(f':{k}' for k in data.keys())
            sql = text(f'INSERT INTO `{table_name}` ({columns}) VALUES ({placeholders})')
            
            try:
                db.session.execute(sql, data)
                db.session.commit()
                return jsonify({"message": "Record added successfully"})
            except Exception as e:
                db.session.rollback()
                logger.error(f"Insert error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        elif request.method == 'PUT':
            data = request.json
            primary_key = get_primary_key(table_name)
            
            if primary_key not in data:
                return jsonify({"error": f"{primary_key} is required"}), 400
            
            record_id = data.pop(primary_key)
            if not data:  # Check if there's data to update
                return jsonify({"error": "No data provided for update"}), 400
            
            set_clause = ', '.join(f"`{k}` = :val_{i}" for i, k in enumerate(data.keys()))
            params = {f'val_{i}': v for i, v in enumerate(data.values())}
            params['record_id'] = record_id
            
            sql = text(f'UPDATE `{table_name}` SET {set_clause} WHERE `{primary_key}` = :record_id')
            
            try:
                db.session.execute(sql, params)
                db.session.commit()
                return jsonify({"message": "Record updated successfully"})
            except Exception as e:
                db.session.rollback()
                logger.error(f"Update error: {str(e)}")
                return jsonify({"error": str(e)}), 500

        elif request.method == 'DELETE':
            data = request.json
            record_id = data.get('id')
            primary_key = data.get('primaryKey')
            
            if not record_id or not primary_key:
                return jsonify({"error": "ID and primary key are required"}), 400
            
            sql = text(f'DELETE FROM `{table_name}` WHERE `{primary_key}` = :record_id')
            
            try:
                db.session.execute(sql, {'record_id': record_id})
                db.session.commit()
                return jsonify({"message": "Record deleted successfully"})
            except Exception as e:
                db.session.rollback()
                logger.error(f"Delete error: {str(e)}")
                return jsonify({"error": str(e)}), 500

    except Exception as e:
        logger.error(f"Error handling table data: {str(e)}")
        logger.error(traceback.format_exc())
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# Add this function to get primary key for each table
def get_primary_key(table_name):
    primary_keys = {
        'products': 'product_id',
        'orders': 'order_id',
        'order_items': 'order_item_id',
        'order_item_refunds': 'order_item_refund_id',
        'website_pageviews': 'website_pageview_id',
        'website_session': 'website_session_id'
    }
    return primary_keys.get(table_name, 'id')

@app.route('/test-db')
def test_db():
    try:
        db.session.execute(text('SELECT 1'))
        return jsonify({"status": "Database connection successful"})
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting application...")
    try:
        with app.app_context():
            logger.info("Testing database connection...")
            db.session.execute(text('SELECT 1'))
            logger.info("Database connection successful")
            
            # List all tables
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            logger.info(f"Available tables: {tables}")
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        logger.error(traceback.format_exc())
    
    app.run(debug=True)