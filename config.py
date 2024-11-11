import os
from dotenv import load_dotenv

load_dotenv()

# Database configuration
SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL')
SQLALCHEMY_TRACK_MODIFICATIONS = False

# Additional MySQL specific configurations
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_recycle': 280,
    'pool_timeout': 20,
    'pool_size': 10,
    'max_overflow': 5
}