import sys
import os

# Add backend directory to sys.path so server module imports cleanly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app
