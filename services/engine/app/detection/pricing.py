"""Typical case values (INR) for enquiries, which carry an interest but no quoted price yet."""

from decimal import Decimal

DEFAULT_ENQUIRY_VALUE = Decimal(3000)

INTEREST_PRICES: dict[str, Decimal] = {
    "aligners": Decimal(65000),
    "implant": Decimal(45000),
    "root_canal": Decimal(8000),
    "crown_bridge": Decimal(12000),
    "cleaning": Decimal(2500),
    "whitening": Decimal(10000),
    "extraction": Decimal(3000),
    "pain_emergency": Decimal(3000),
    "kids": Decimal(2000),
    "general_checkup": Decimal(1000),
    "price_enquiry": Decimal(5000),
    "other": DEFAULT_ENQUIRY_VALUE,
}

# Used for an overdue task with nothing to price it by (no enquiry, no open planned follow-up).
DEFAULT_TASK_VALUE = Decimal(2000)


def enquiry_value(interest: str | None) -> Decimal:
    return INTEREST_PRICES.get(interest or "other", DEFAULT_ENQUIRY_VALUE)
