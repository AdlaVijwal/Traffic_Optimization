PYTHON ?= python
VENV ?= .venv
ACTIVATE = source $(VENV)/bin/activate

.PHONY: install run test lint clean

install:
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	@$(ACTIVATE) && pip install -U pip
	@$(ACTIVATE) && pip install -r requirements.txt

run:
	@$(ACTIVATE) && python app/detect.py --source sample_videos/traffic_junction.mp4

test:
	@$(ACTIVATE) && pytest -q

lint:
	@$(ACTIVATE) && ruff check app tests

clean:
	rm -rf $(VENV)
	rm -f data/results.json
	rm -rf app/cache/pending/*.json
