from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/harbin_traffic"
    )
    db_conninfo: str = "dbname=harbin_traffic user=postgres host=localhost port=5432"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    business_timezone: str = "Asia/Shanghai"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
