"""Optional dev-only YAML/Jinja verifier; no Home Assistant, network or service calls.
Install PyYAML/Jinja2 in an isolated environment, never runtime dependencies.
"""
from pathlib import Path
import yaml
import jinja2

configuration = yaml.safe_load(Path("examples/home-assistant/sector-watch.yaml").read_text())
sensor = configuration["rest"][0]["sensor"][0]
assert configuration["rest"][0]["method"] == "GET"
assert configuration["rest"][0]["verify_ssl"] is True
assert configuration["input_boolean"]["aegis_schedule_notice_opt_in"]["initial"] is False
assert configuration["automation"][0]["initial_state"] is False
assert configuration["automation"][0]["actions"][0]["action"] == "persistent_notification.create"
template = jinja2.Environment().from_string(sensor["value_template"])
base = {"meta": {"synthetic": False, "source_status": "available"}, "data": [{
    "id": "synthetic-v1", "revision_no": 1, "latest_revision_no": 1,
    "review_state": "reviewed", "effective_status": "published",
    "source_status": "current", "type": "maintenance",
}]}
assert template.render(value_json=base).strip() == "synthetic-v1:1"
for patch in [{"synthetic": True}, {"source_status": "stale"}]:
    assert template.render(value_json={**base, "meta": {**base["meta"], **patch}}).strip() == "desconocido"
assert template.render(value_json={"meta": base["meta"], "data": []}).strip() == "sin_programacion_verificada"
for patch in [{"type": "industrial"}, {"review_state": "pending"}, {"effective_status": "unverified"}, {"latest_revision_no": 2}]:
    value = {**base, "data": [{**base["data"][0], **patch}]}
    assert template.render(value_json=value).strip() == "desconocido"
print("YAML/Jinja reviewed/stale/synthetic/empty/industrial/pending/version-mismatch: OK; no HA runtime")
