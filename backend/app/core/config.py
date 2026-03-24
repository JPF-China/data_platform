from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://apple@localhost:5432/harbin_traffic"
    db_conninfo: str = "dbname=harbin_traffic user=apple host=localhost port=5432"
    api_host: str = "0.0.0.0"
    api_port: int = 8000


settings = Settings()
