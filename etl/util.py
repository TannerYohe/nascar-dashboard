import re

from nascar_api.enums import Series, Flag
from typing import Optional
import locale


def get_series_str(series: Series) -> str:
    match series:
        case Series.CUP:
            return "Cup Series"
        case Series.XFINITY:
            return "Xfinity"
        case Series.TRUCK:
            return "Truck Series"
        case _:
            raise ValueError("Unknown series code")


def get_flag_str(flag: Flag) -> str:
    match flag:
        case Flag.GREEN:
            return "Green"
        case Flag.YELLOW:
            return "Yellow"
        case Flag.RED:
            return "Red"
        case Flag.WHITE:
            return "White"
        case Flag.CHECKERED:
            return "Checkered"
        case Flag.HOT_TRACK:
            return "Hot Track"
        case Flag.COLD_TRACK:
            return "Cold Track"
        case _:
            raise ValueError("Unknown flag code")


def optional_str_to_int(input_value: Optional[str]) -> Optional[int]:
    if input_value:
        if input_value.isdigit():
            return int(input_value)
        elif "," in input_value:
            return comma_str_to_int(input_value)
        else:
            match = re.findall(r"\d+", input_value)
            if match:
                return int(match[0])
    return None


def bad_int_to_series(int_value: int) -> Optional[int]:
    if 0 < int_value < 4:
        return int_value
    return None


def comma_str_to_int(input_value: Optional[str]) -> Optional[float]:
    locale.setlocale(locale.LC_ALL, "en_US.UTF-8")
    return locale.atof(input_value)
