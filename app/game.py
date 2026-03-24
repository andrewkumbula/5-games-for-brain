from collections import Counter


def evaluate_guess(secret: str, guess: str) -> list[str]:
    result = ["absent"] * 5
    remaining = Counter(secret)

    for i, (s_char, g_char) in enumerate(zip(secret, guess)):
        if g_char == s_char:
            result[i] = "correct"
            remaining[g_char] -= 1

    for i, (s_char, g_char) in enumerate(zip(secret, guess)):
        if result[i] != "absent":
            continue
        if remaining[g_char] > 0:
            result[i] = "present"
            remaining[g_char] -= 1

    return result


def encode_result(result: list[str]) -> str:
    mapping = {"correct": "G", "present": "Y", "absent": "B"}
    return "".join(mapping[r] for r in result)


def render_colored_guess(guess: str, encoded_result: str) -> str:
    tiles = {"G": "🟩", "Y": "🟨", "B": "⬛"}
    letters = guess.upper()
    return "".join(tiles[state] + letter for state, letter in zip(encoded_result, letters))
