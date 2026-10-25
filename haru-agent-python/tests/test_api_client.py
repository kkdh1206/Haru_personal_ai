from api_client import BackendApiClient


async def test_uses_agent_shared_secret_as_default_header(monkeypatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", "worker-secret")

    client = BackendApiClient("http://backend.invalid/")
    try:
        assert client.base_url == "http://backend.invalid"
        assert client.client.headers["x-haru-agent-secret"] == "worker-secret"
    finally:
        await client.close()


async def test_explicit_secret_overrides_environment(monkeypatch):
    monkeypatch.setenv("AGENT_SHARED_SECRET", "environment-secret")

    client = BackendApiClient("http://backend.invalid", "explicit-secret")
    try:
        assert client.client.headers["x-haru-agent-secret"] == "explicit-secret"
    finally:
        await client.close()


async def test_omits_header_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("AGENT_SHARED_SECRET", raising=False)

    client = BackendApiClient("http://backend.invalid")
    try:
        assert "x-haru-agent-secret" not in client.client.headers
    finally:
        await client.close()
