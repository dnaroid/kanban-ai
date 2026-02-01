import argparse
import json
import sys
from vosk import Model, KaldiRecognizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--rate", type=int, default=16000)
    args = parser.parse_args()

    model = Model(args.model)
    recognizer = KaldiRecognizer(model, args.rate)
    recognizer.SetWords(True)

    while True:
        data = sys.stdin.buffer.read(4000)
        if not data:
            break

        if recognizer.AcceptWaveform(data):
            result = recognizer.Result()
            sys.stdout.write(
                json.dumps({"type": "final", "data": json.loads(result)}) + "\n"
            )
            sys.stdout.flush()
        else:
            partial = recognizer.PartialResult()
            sys.stdout.write(
                json.dumps({"type": "partial", "data": json.loads(partial)}) + "\n"
            )
            sys.stdout.flush()

    final_result = recognizer.FinalResult()
    sys.stdout.write(
        json.dumps({"type": "final", "data": json.loads(final_result)}) + "\n"
    )
    sys.stdout.flush()


if __name__ == "__main__":
    main()
