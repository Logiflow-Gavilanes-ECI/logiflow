import os
import sys

# Make the service package importable as a flat module so
# `from predictor import ...` works whether tests run from the service
# directory or from the repo root.
SERVICE_ROOT = os.path.dirname(os.path.abspath(__file__))
if SERVICE_ROOT not in sys.path:
    sys.path.insert(0, SERVICE_ROOT)
