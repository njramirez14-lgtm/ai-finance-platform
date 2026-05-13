from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    debug: bool = True
    database_url: str
    google_api_key: str = ""

    # Auth configs
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
