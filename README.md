
# DriveSafe AI — Driver Drowsiness Detection

A beginner-friendly BTech AIML mini-project scaffold:
- React + Vite light-theme website
- Flask API
- Google Colab notebook to train and evaluate a CNN on a labeled open/closed-eye dataset
- Webcam frame upload from the browser

## Important
The website is a real working scaffold, but live predictions require you to train a model and place `eye_cnn.keras` in `backend/models/`. Do not present example metrics as real results. The model detects eye state; the app uses sustained closed-eye predictions as a drowsiness warning. It is a student prototype, not a certified driving safety device.

## 1. Install prerequisites (Windows)
Install:
- Python 3.11: https://www.python.org/downloads/
- Node.js LTS: https://nodejs.org/
- VS Code: https://code.visualstudio.com/

During Python setup, tick "Add Python to PATH".

## 2. Start the backend
Open a terminal in this folder:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

If PowerShell blocks activation, use Command Prompt terminal and run:
```bat
.venv\Scripts\activate.bat
```

Backend runs at http://127.0.0.1:5000.

## 3. Train the model in Google Colab
1. Open `notebooks/DriveSafe_Train_Model.ipynb` in Google Colab. (Upload the notebook to Google Drive, then open it with Colab.)
2. Prepare a ZIP dataset with this exact structure:

```
eye_dataset.zip
  train/
    open/
      image1.jpg
    closed/
      image2.jpg
  test/
    open/
    closed/
```

You need real, correctly labeled eye images. You may use a reputable public eye-state dataset, subject to its license/terms. Keep train and test subjects separate where the dataset supports that, to reduce data leakage.
3. Run the notebook cells in order. It trains a CNN, prints test accuracy, precision, recall, F1, confusion matrix and saves `eye_cnn.keras`.
4. Download `eye_cnn.keras` from Colab and copy it into `backend/models/`.

Do not invent or copy sample scores into your report; use the values printed by your own run.

## 4. Start the website
Open a second terminal at the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, usually http://localhost:5173.

## 5. Use Live Detection
- Start the backend and frontend in separate terminals.
- In the website, allow camera access and click Start Camera.
- The browser sends a frame to Flask every ~700 ms.
- The backend uses MediaPipe Face Mesh to locate the eyes, crops the eye regions, and asks your trained CNN whether each eye is open or closed.
- Sustained closed-eye predictions trigger an on-screen warning and a browser beep.
- The webcam must be used only with the consent of the person in view.

## Troubleshooting
- `Model not found`: copy `eye_cnn.keras` into `backend/models/`.
- Camera blocked: allow camera access for localhost in browser settings.
- CORS/network error: ensure Flask is running at port 5000.
- Python package installation errors: use Python 3.11 and the venv above.
- If eye crops look very different from training images, model predictions may be poor. Train on representative images and test under varied lighting.
