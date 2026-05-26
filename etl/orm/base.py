from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from uuid import UUID, uuid4


class Base(DeclarativeBase):
    __abstract__ = True
    id_uuid: Mapped[UUID] = mapped_column(primary_key=True, server_default="uuid_generate_v4()")


class RealBase(Base):
    __abstract__ = True

    def __init__(self, **kwargs):
        kwargs["id_uuid"] = uuid4()
        super().__init__(**kwargs)