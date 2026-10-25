
from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
import base64
import time
import cv2
import numpy as np

app = Flask(__name__)

CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174"
]}})

MODEL_PATH = Path(__file__).parent / "models" / "eye_cnn.keras"
IMG_SIZE = (64, 64)

# Alarm settings
EAR_THRESHOLD = 0.20
ALARM_DELAY_SECONDS = 3.0

# Tracks continuous closure duration
closure_started_at = None

model = None
model_error = None
face_mesh = None

# Load the trained eye detection model
try:
    import tensorflow as tf

    if MODEL_PATH.exists():
        model = tf.keras.models.load_model(MODEL_PATH)
        print("Eye model loaded successfully.")
    else:
        model_error = (
            f"Model file not found at {MODEL_PATH}. "
            "Place eye_cnn.keras inside backend/models/."
        )

except Exception as exc:
    model_error = f"Could not load model: {exc}"
    print("Model loading error:", exc)

# Initialize MediaPipe Face Mesh
try:
    import mediapipe as mp

    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    print("MediaPipe Face Mesh initialized.")

except Exception as exc:
    print("MediaPipe initialization warning:", exc)

# MediaPipe eye landmark indices
LEFT_EYE = [33, 133, 160, 159, 158, 144, 145, 153]
RIGHT_EYE = [362, 263, 387, 386, 385, 373, 374, 380]

# Ordered landmarks for Eye Aspect Ratio (EAR)
LEFT_EAR = [33, 160, 158, 133, 153, 144]
RIGHT_EAR = [362, 387, 385, 263, 373, 380]


def calculate_ear(landmarks, indices, frame_shape):
    """Calculate the Eye Aspect Ratio from six eye landmarks."""
    h, w = frame_shape[:2]

    points = np.array([
        [landmarks[i].x * w, landmarks[i].y * h]
        for i in indices
    ], dtype=np.float32)

    horizontal = np.linalg.norm(points[0] - points[3])

    if horizontal < 1:
        return 0.0

    vertical_1 = np.linalg.norm(points[1] - points[5])
    vertical_2 = np.linalg.norm(points[2] - points[4])

    return float(
        (vertical_1 + vertical_2) / (2.0 * horizontal)
    )


def crop_eye(frame, landmarks, indices):
    h, w = frame.shape[:2]

    points = np.array([
        (int(landmarks[i].x * w), int(landmarks[i].y * h))
        for i in indices
    ])

    x1, y1 = points.min(axis=0)
    x2, y2 = points.max(axis=0)

    eye_w = max(1, x2 - x1)
    eye_h = max(1, y2 - y1)

    # Moderate padding around the eye
    pad_x = max(4, int(eye_w * 0.25))
    pad_y = max(6, int(eye_h * 1.0))

    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    crop = frame[y1:y2, x1:x2]

    if crop.size == 0:
        return None

    return crop


def predict_eye(eye_bgr):
    """Run the trained CNN and return its predicted eye state."""
    if model is None:
        return "unknown", 0.0

    eye = cv2.resize(eye_bgr, IMG_SIZE)
    eye = cv2.cvtColor(eye, cv2.COLOR_BGR2RGB).astype("float32")

    prediction = model.predict(
        np.expand_dims(eye, axis=0),
        verbose=0
    )

    prob_open = float(prediction[0][0])

    state = "open" if prob_open >= 0.5 else "closed"

    return state, prob_open


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "model_message": (
            "Model loaded." if model is not None else model_error
        ),
        "face_landmarks_ready": face_mesh is not None
    })


@app.post("/api/predict")
def predict():
    global closure_started_at

    if model is None:
        return jsonify({
            "error": model_error or "Model is not loaded."
        }), 503

    if face_mesh is None:
        return jsonify({
            "error": (
                "MediaPipe Face Mesh is unavailable. "
                "Check backend installation."
            )
        }), 503

    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image", "")

    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    if not image_data:
        return jsonify({"error": "No image provided."}), 400

    try:
        raw = base64.b64decode(image_data)

        frame = cv2.imdecode(
            np.frombuffer(raw, np.uint8),
            cv2.IMREAD_COLOR
        )

        if frame is None:
            return jsonify({
                "error": "Could not decode image."
            }), 400

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        # Reset the timer if the face is lost
        if not results.multi_face_landmarks:
            closure_started_at = None

            return jsonify({
                "face_detected": False,
                "eyes": [],
                "closed_eyes": 0,
                "both_closed": False,
                "closure_duration": 0.0,
                "alarm": False,
                "message": (
                    "No face detected. Center your face in the camera."
                )
            })

        landmarks = results.multi_face_landmarks[0].landmark
        outputs = []

        # Analyze each eye using landmarks and the CNN
        for label, crop_indices, ear_indices in [
            ("left", LEFT_EYE, LEFT_EAR),
            ("right", RIGHT_EYE, RIGHT_EAR)
        ]:
            crop = crop_eye(frame, landmarks, crop_indices)

            if crop is None:
                continue

            ear = calculate_ear(
                landmarks,
                ear_indices,
                frame.shape
            )

            # Retain the trained CNN prediction for display/debugging
            cnn_state, p_open = predict_eye(crop)

            # EAR is used for the closure alarm trigger
            eye_closed = ear < 0.20
            state = "closed" if eye_closed else cnn_state

            outputs.append({
                "eye": label,
                "state": state,
                "ear": round(ear, 3),
                "cnn_state": cnn_state,
                "open_probability": round(p_open, 3)
            })

            print(
                f"{label}: EAR={ear:.3f}, "
                f"CNN={cnn_state}, state={state}",
                flush=True
            )

        if len(outputs) != 2:
            closure_started_at = None

            return jsonify({
                "face_detected": True,
                "eyes": outputs,
                "closed_eyes": sum(
                    item["state"] == "closed" for item in outputs
                ),
                "both_closed": False,
                "closure_duration": 0.0,
                "alarm": False,
                "message": "Could not locate both eyes clearly."
            })

        closed_count = sum(
            item["state"] == "closed" for item in outputs
        )

        both_closed = closed_count == 2
        now = time.monotonic()

        if both_closed:
            if closure_started_at is None:
                closure_started_at = now

            closure_duration = now - closure_started_at
        else:
            closure_started_at = None
            closure_duration = 0.0

        alarm = (
            both_closed
            and closure_duration >= ALARM_DELAY_SECONDS
        )

        message = (
            "Drowsiness alert!"
            if alarm
            else (
                "Eyes closed. Monitoring duration."
                if both_closed
                else "Eye state analyzed."
            )
        )

        return jsonify({
            "face_detected": True,
            "eyes": outputs,
            "closed_eyes": closed_count,
            "both_closed": both_closed,
            "closure_duration": round(closure_duration, 2),
            "alarm": alarm,
            "message": message
        })

    except Exception as exc:
        print("Prediction error:", exc, flush=True)

        return jsonify({
            "error": f"Prediction failed: {exc}"
        }), 500


if __name__ == "__main__":
    print("DriveSafe AI backend: http://127.0.0.1:5000")
    print("Model loaded:", model is not None)

    if model_error:
        print("Model status:", model_error)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )

