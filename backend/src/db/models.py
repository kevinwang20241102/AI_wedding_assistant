"""账号与婚礼业务持久化模型。从 pycore 模板复制后按本项目契约扩展。"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类。"""

    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(11), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    credential_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(11), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Wedding(Base):
    __tablename__ = "weddings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    wedding_date: Mapped[date] = mapped_column(Date, nullable=False)
    city: Mapped[str] = mapped_column(String(64), nullable=False)
    total_budget_fen: Mapped[int] = mapped_column(Integer, nullable=False)
    guest_estimate: Mapped[int] = mapped_column(Integer, nullable=False)
    groom_nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    groom_birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    bride_nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bride_birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    other_preference: Mapped[str | None] = mapped_column(Text, nullable=True)
    canvas_scale: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    canvas_offset_x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    canvas_offset_y: Mapped[float] = mapped_column(Float, nullable=False, default=0)


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id"), nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="未开始")
    due_date_customized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    amount_fen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="未确定")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class GuestGroup(Base):
    __tablename__ = "guest_groups"
    __table_args__ = (UniqueConstraint("wedding_id", "name", name="uq_guest_groups_wedding_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_preset: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    table_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    is_head: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pos_x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    pos_y: Mapped[float] = mapped_column(Float, nullable=False, default=0)


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    group_id: Mapped[int] = mapped_column(ForeignKey("guest_groups.id"), nullable=False)
    attendance: Mapped[str] = mapped_column(String(16), nullable=False, default="待定")
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    table_id: Mapped[int | None] = mapped_column(
        ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )


class WeddingPhoto(Base):
    __tablename__ = "wedding_photos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    wedding_id: Mapped[int] = mapped_column(
        ForeignKey("weddings.id"), nullable=False, index=True
    )
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(4000), nullable=False)
    title_customized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    model_id: Mapped[str] = mapped_column(String(64), nullable=False, default="deepseek-flash")
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    error_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    earlier_unused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    module_link: Mapped[str | None] = mapped_column(String(16), nullable=True)
    feedback: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    model_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ConversationImage(Base):
    __tablename__ = "conversation_images"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversation_messages.id", ondelete="SET NULL"), nullable=True
    )
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
