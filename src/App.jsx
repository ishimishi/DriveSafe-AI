
import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, Activity, Camera, BrainCircuit, CarFront, Menu, X,
  Play, Square, AlertTriangle, CheckCircle2, CircleHelp, Gauge,
  ChartNoAxesCombined, Clock3, Eye, ArrowRight, LockKeyhole,
} from 'lucide-react';

const API = 'http://127.0.0.1:5000';

function Brand() {
  return (
    <a className="brand" href="#home">
      <span className="brand-icon"><ShieldCheck size={21} /></span>
      <span>DriveSafe <b>AI</b></span>
    </a>
  );
}

function App() {
  const [page, setPage] = useState('Home');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [health, setHealth] = useState({
    status: 'checking',
    model_loaded: false,
    model_message: 'Checking backend…',
  });
  const [cameraOn, setCameraOn] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState(0);
  const [closedSince, setClosedSince] = useState(null);
  const [alertActive, setAlertActive] = useState(false);
  const [sessions, setSessions] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const closedRef = useRef(null);
  const alertRef = useRef(false);
  const beepRef = useRef(null);
  const alarmOscillatorRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({
          status: 'offline',
          model_loaded: false,
          model_message: 'Backend not running. Start Flask in the backend folder.',
        })
      );
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function navigate(next) {
    setPage(next);
    setMobileMenu(false);

    if (next !== 'Live Detection') {
      stopCamera();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function startCamera() {
    setError('');
    setPrediction(null);
    setAlertActive(false);
    alertRef.current = false;
    closedRef.current = null;
    setClosedSince(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraOn(true);
      setSessions(s => s + 1);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(sendFrame, 750);
    } catch (e) {
      setError(
        'Camera access was blocked. Allow camera access for localhost in your browser settings.'
      );
    }
  }

  function stopCamera() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop the alarm immediately when the camera is stopped.
    if (alarmOscillatorRef.current) {
      try {
        alarmOscillatorRef.current.stop();
      } catch (e) {
        // The oscillator may already have stopped.
      }

      alarmOscillatorRef.current = null;
    }

    setCameraOn(false);
    setAlertActive(false);
    alertRef.current = false;
    closedRef.current = null;
    setClosedSince(null);
  }

  async function sendFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const res = await fetch(`${API}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: canvas.toDataURL('image/jpeg', 0.75),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Prediction unavailable.');
        return;
      }

      setError('');
      setPrediction(data);

      if (data.both_closed) {
        // Record when both eyes first become detected as closed.
        if (!closedRef.current) {
          closedRef.current = Date.now();
          setClosedSince(Date.now());
        }

        // Start the alarm only once for this eye-closure episode.
        if (!alertRef.current) {
          alertRef.current = true;
          setAlertActive(true);
          setAlerts(a => a + 1);

          try {
            const AudioCtx =
              window.AudioContext || window.webkitAudioContext;

            if (!AudioCtx) {
              throw new Error('Web Audio is not supported by this browser.');
            }

            if (!beepRef.current) {
              beepRef.current = new AudioCtx();
            }

            const ac = beepRef.current;

            if (ac.state === 'suspended') {
              await ac.resume();
            }

            const oscillator = ac.createOscillator();
            const gain = ac.createGain();

            oscillator.type = 'square';
            oscillator.frequency.value = 880;
            gain.gain.value = 0.12;

            oscillator.connect(gain);
            gain.connect(ac.destination);

            // Save the oscillator so it can be stopped when eyes open.
            alarmOscillatorRef.current = oscillator;

            oscillator.onended = () => {
              if (alarmOscillatorRef.current === oscillator) {
                alarmOscillatorRef.current = null;
              }
            };

            oscillator.start();
          } catch (e) {
            console.error('Alarm sound error:', e);
          }
        }
      } else {
  // Stop the alarm as soon as either eye is detected as open.
  closedRef.current = null;
  setClosedSince(null);
  alertRef.current = false;
  setAlertActive(false);

  const oscillator = alarmOscillatorRef.current;

  if (oscillator) {
    // Clear the reference immediately.
    alarmOscillatorRef.current = null;

    try {
      oscillator.stop();
    } catch (e) {
      // Oscillator may already have stopped.
    }

    oscillator.disconnect();
  }
}
    } catch (e) {
      setError(
        'Cannot reach the AI backend. Check that Flask is running on port 5000.'
      );
    }
  }

  const nav = [
    'Home',
    'Live Detection',
    'Model Performance',
    'Dashboard',
    'About',
  ];

  const goLive = () => navigate('Live Detection');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />

          <nav className={mobileMenu ? 'nav-links open' : 'nav-links'}>
            {nav.map(n => (
              <button
                key={n}
                className={page === n ? 'nav-link active' : 'nav-link'}
                onClick={() => navigate(n)}
              >
                {n}
              </button>
            ))}
          </nav>

          <button className="primary small top-cta" onClick={goLive}>
            <Play size={14} fill="currentColor" /> Start Detection
          </button>

          <button
            className="mobile-toggle"
            onClick={() => setMobileMenu(v => !v)}
            aria-label="Toggle menu"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {page === 'Home' && (
        <main>
          <section className="hero wrap">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="live-dot" /> AI-POWERED ROAD SAFETY SOLUTION
              </span>

              <h1>
                Stay alert.<br />
                <span>Arrive safely.</span>
              </h1>

              <p className="hero-text">
                An AI-powered driver monitoring prototype that detects
                prolonged eye closure and helps raise awareness of drowsiness
                on the road.
              </p>

              <div className="hero-actions">
                <button className="primary" onClick={goLive}>
                  <Play size={16} fill="currentColor" /> Start Detection
                  <ArrowRight size={16} />
                </button>
                <button
                  className="secondary"
                  onClick={() => navigate('About')}
                >
                  Explore project
                </button>
              </div>

              <div className="hero-proof">
                <div>
                  <ShieldCheck />
                  <span>
                    <b>Safety focused</b>
                    <small>Timely visual and audio alerts</small>
                  </span>
                </div>
                <div>
                  <BrainCircuit />
                  <span>
                    <b>ML powered</b>
                    <small>Uses a trained eye-state model</small>
                  </span>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="road-art">
                <div className="sun"></div>
                <div className="road"></div>
                <div className="road-line"></div>
                <div className="car-silhouette">
                  <div className="windshield"></div>
                  <div className="wheel w1"></div>
                  <div className="wheel w2"></div>
                </div>
                <div className="road-label">
                  <span className="green-dot" /> DriveSafe monitoring
                </div>
              </div>

              <div className="visual-note">
                <span className="note-icon"><Eye /></span>
                <span>
                  <b>Eyes on the road</b>
                  <small>Computer vision • Real-time analysis</small>
                </span>
              </div>
            </div>
          </section>

          <section className="feature-strip wrap">
            <Feature
              icon={<Camera />}
              title="Live camera"
              text="Monitor eye state using a webcam."
            />
            <Feature
              icon={<BrainCircuit />}
              title="Trained model"
              text="Predicts open or closed eye images."
            />
            <Feature
              icon={<Activity />}
              title="Drowsiness alerts"
              text="Warns after sustained eye closure."
            />
            <Feature
              icon={<ChartNoAxesCombined />}
              title="Model evaluation"
              text="Review measured test-set results."
            />
          </section>

          <section className="section wrap">
            <SectionTitle
              eyebrow="HOW IT WORKS"
              title="A simple, transparent workflow"
              subtitle="From camera input to a clear alert, each stage can be demonstrated and explained."
            />

            <div className="steps-grid">
              <Step
                n="01"
                title="Capture"
                text="The browser asks permission to use your webcam."
              />
              <Step
                n="02"
                title="Analyze"
                text="Face landmarks help locate the eye regions."
              />
              <Step
                n="03"
                title="Predict"
                text="Your trained CNN estimates open or closed eye state."
              />
              <Step
                n="04"
                title="Alert"
                text="Sustained closed-eye predictions trigger a warning."
              />
            </div>
          </section>

          <section className="cta-band wrap">
            <div>
              <span className="eyebrow">READY TO TEST?</span>
              <h2>Try the live detection demo</h2>
              <p>
                Allow camera access and see the pipeline in action after the
                trained model is installed.
              </p>
            </div>
            <button className="primary" onClick={goLive}>
              Open live detection <ArrowRight size={16} />
            </button>
          </section>
        </main>
      )}

      {page === 'Live Detection' && (
        <main className="wrap page-main">
          <PageHeading
            eyebrow="REAL-TIME MONITORING"
            title="Live Detection"
            subtitle="Use a webcam to analyze eye state. This prototype is for academic demonstration only."
          />

          <div className="live-layout">
            <section className="panel camera-panel">
              <div className="panel-heading">
                <span>
                  <span className={cameraOn ? 'live-dot' : 'gray-dot'} />
                  {cameraOn ? 'Camera is running' : 'Live camera feed'}
                </span>
                <span className="tiny-tag">LOCAL CAMERA</span>
              </div>

              <div className="camera-stage">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={cameraOn ? 'camera-video' : 'camera-video hidden-video'}
                />

                {!cameraOn && (
                  <div className="camera-placeholder">
                    <div className="camera-placeholder-icon">
                      <Camera size={32} />
                    </div>
                    <b>Your camera preview will appear here</b>
                    <span>Start the camera to begin detection.</span>
                  </div>
                )}

                {cameraOn && (
                  <div className="scan-frame">
                    <i /><i /><i /><i />
                  </div>
                )}

                {cameraOn && (
                  <div className="camera-state">
                    <span
                      className={prediction?.both_closed ? 'red-dot' : 'green-dot'}
                    />
                    {prediction?.both_closed
                      ? 'Eyes appear closed'
                      : 'Monitoring active'}
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden-canvas" />

              <div className="camera-controls">
                {!cameraOn ? (
                  <button className="primary" onClick={startCamera}>
                    <Play size={15} fill="currentColor" /> Start Camera
                  </button>
                ) : (
                  <button className="danger-button" onClick={stopCamera}>
                    <Square size={15} fill="currentColor" /> Stop Camera
                  </button>
                )}

                <span className="privacy-note">
                  <LockKeyhole size={13} /> Frames sent to your local backend
                </span>
              </div>

              {error && (
                <div className="inline-error">
                  <AlertTriangle size={16} />{error}
                </div>
              )}

              {!health.model_loaded && (
                <div className="inline-warning">
                  <CircleHelp size={17} />
                  <span>
                    <b>Model not ready.</b>{' '}
                    {health.model_message ||
                      'Train the model in Colab and install it in backend/models/.'}
                  </span>
                </div>
              )}
            </section>

            <aside className="panel status-panel">
              <div className="panel-heading">
                <b>Detection status</b>
                <span className="status-pill">
                  <span className={health.model_loaded ? 'green-dot' : 'amber-dot'} />
                  {health.model_loaded ? 'Model ready' : 'Model unavailable'}
                </span>
              </div>

              <div className={alertActive ? 'alert-card danger' : 'alert-card safe'}>
                {alertActive ? <AlertTriangle /> : <CheckCircle2 />}
                <div>
                  <b>{alertActive ? 'Drowsiness warning' : 'Keep focused'}</b>
                  <span>
                    {alertActive
                      ? 'Prolonged eye closure detected. Take a safe break.'
                      : prediction?.face_detected === false
                        ? 'Face not detected. Center your face in view.'
                        : 'No sustained closure alert right now.'}
                  </span>
                </div>
              </div>

              <Metric
                label="Left eye"
                value={prediction?.eyes?.find(e => e.eye === 'left')?.state || '—'}
                icon={<Eye />}
              />
              <Metric
                label="Right eye"
                value={prediction?.eyes?.find(e => e.eye === 'right')?.state || '—'}
                icon={<Eye />}
              />
              <Metric
                label="Alerts this visit"
                value={String(alerts)}
                icon={<AlertTriangle />}
              />

              <div className="status-foot">
                <span>Backend</span>
                <b className={health.status === 'ok' ? 'good-text' : 'bad-text'}>
                  {health.status === 'ok' ? 'Connected' : 'Not connected'}
                </b>
              </div>

              <div className="status-foot">
                <span>Face detection</span>
                <b>{prediction?.face_detected ? 'Face found' : 'Waiting for camera'}</b>
              </div>
            </aside>
          </div>

          <p className="disclaimer">
            <CircleHelp size={15} /> Eye-state classification can be affected by
            lighting, glasses, camera angle and training data. This student
            prototype must not be used as a substitute for safe driving practices.
          </p>
        </main>
      )}

      {page === 'Model Performance' && (
        <main className="wrap page-main">
          <PageHeading
            eyebrow="MODEL EVALUATION"
            title="Model Performance"
            subtitle="Evaluation results from your trained eye-state CNN."
          />

          <div className="notice-card">
            <CircleHelp />
            <div>
              <b>Model evaluation complete</b>
              <p>
                Evaluated on 16,980 test images from the eye-state dataset.
                Accuracy is calculated from the confusion matrix below.
              </p>
            </div>
          </div>

          <div className="metrics-grid">
            {[
              ['Test accuracy', '98.82%'],
              ['Precision (closed)', '98.78%'],
              ['Recall (closed)', '98.84%'],
              ['F1 score (closed)', '98.81%'],
            ].map(([label, value]) => (
              <div className="metric-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Test dataset</small>
              </div>
            ))}
          </div>

          <div className="two-panels">
            <div className="panel chart-panel">
              <h3>Training &amp; Validation Accuracy</h3>
              <div className="performance-chart">
                <svg
                  viewBox="0 0 340 210"
                  width="100%"
                  role="img"
                  aria-label="Training and validation accuracy over 15 epochs"
                >
                  {[40, 70, 100, 130].map(y => (
                    <line
                      key={y}
                      x1="42"
                      y1={y}
                      x2="325"
                      y2={y}
                      stroke="currentColor"
                      opacity="0.15"
                    />
                  ))}

                  <text x="4" y="43" fontSize="10" fill="currentColor">100%</text>
                  <text x="8" y="73" fontSize="10" fill="currentColor">95%</text>
                  <text x="8" y="103" fontSize="10" fill="currentColor">90%</text>

                  {[
                    {
                      name: 'Training',
                      color: '#2563eb',
                      values: [
                        91.772, 96.209, 97.139, 97.593, 97.727,
                        97.921, 98.051, 98.126, 98.335, 98.295,
                        98.376, 98.455, 98.538, 98.528, 98.532,
                      ],
                    },
                    {
                      name: 'Validation',
                      color: '#16a34a',
                      values: [
                        96.243, 97.744, 98.051, 98.422, 97.962,
                        98.498, 98.610, 98.693, 98.722, 98.799,
                        98.822, 98.728, 98.810, 98.746, 98.852,
                      ],
                    },
                  ].map(series => {
                    const points = series.values
                      .map((value, index) => {
                        const x = 42 + index * (283 / 14);
                        const y = 130 - (value - 90) * 6;
                        return `${x},${y}`;
                      })
                      .join(' ');

                    return (
                      <polyline
                        key={series.name}
                        points={points}
                        fill="none"
                        stroke={series.color}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    );
                  })}

                  <text x="42" y="151" fontSize="10" fill="currentColor">1</text>
                  <text x="180" y="151" fontSize="10" fill="currentColor">8</text>
                  <text x="310" y="151" fontSize="10" fill="currentColor">15</text>
                  <text x="150" y="174" fontSize="11" fill="currentColor">Epoch</text>

                  <line
                    x1="65" y1="195" x2="85" y2="195"
                    stroke="#2563eb" strokeWidth="3"
                  />
                  <text x="90" y="199" fontSize="11" fill="currentColor">Training</text>

                  <line
                    x1="185" y1="195" x2="205" y2="195"
                    stroke="#16a34a" strokeWidth="3"
                  />
                  <text x="210" y="199" fontSize="11" fill="currentColor">Validation</text>
                </svg>

                <p>
                  Training accuracy improved from 91.77% to 98.53%, while
                  validation accuracy reached 98.85% over 15 epochs.
                </p>
              </div>
            </div>

            <div className="panel chart-panel">
              <h3>Confusion Matrix</h3>
              <p className="matrix-note">
                Rows = actual class; columns = predicted class
              </p>

              <div className="visual-matrix">
                <div className="matrix-axis-label">Predicted Class</div>

                <div className="visual-matrix-grid">
                  <div className="matrix-empty"></div>
                  <div className="matrix-heading">Closed</div>
                  <div className="matrix-heading">Open</div>

                  <div className="matrix-row-label">Closed</div>
                  <div className="matrix-cell correct-cell">
                    <strong>8,292</strong>
                    <small>Correct</small>
                  </div>
                  <div className="matrix-cell error-cell">
                    <strong>97</strong>
                    <small>Incorrect</small>
                  </div>

                  <div className="matrix-row-label">Open</div>
                  <div className="matrix-cell error-cell">
                    <strong>103</strong>
                    <small>Incorrect</small>
                  </div>
                  <div className="matrix-cell correct-cell">
                    <strong>8,488</strong>
                    <small>Correct</small>
                  </div>
                </div>

                <div className="matrix-axis-label">Actual Class</div>
              </div>

              <div className="matrix-legend">
                <span>Correct predictions: 16,780</span>
                <span>Incorrect predictions: 200</span>
              </div>
            </div>
          </div>
        </main>
      )}

      {page === 'Dashboard' && (
        <main className="wrap page-main">
          <PageHeading
            eyebrow="SESSION OVERVIEW"
            title="Monitoring Dashboard"
            subtitle="A lightweight summary of this browser session."
          />

          <div className="metrics-grid">
            {[
              { label: 'Camera sessions', value: sessions, icon: <Camera /> },
              { label: 'Drowsiness alerts', value: alerts, icon: <AlertTriangle /> },
              { label: 'Backend', value: health.status === 'ok' ? 'Online' : 'Offline', icon: <Activity /> },
              { label: 'Model status', value: health.model_loaded ? 'Ready' : 'Not trained', icon: <BrainCircuit /> },
            ].map(m => (
              <div className="metric-card" key={m.label}>
                <div className="metric-icon">{m.icon}</div>
                <span>{m.label}</span>
                <strong className="dashboard-value">{m.value}</strong>
              </div>
            ))}
          </div>

          <div className="panel chart-panel session-panel">
            <h3>Current session</h3>
            <p className="muted">
              This dashboard keeps counters only in the current browser session.
              Persistent reports and a database can be added as a future extension.
            </p>
            <div className="session-status">
              <span className={cameraOn ? 'green-dot' : 'gray-dot'} />
              {cameraOn ? 'Camera currently active' : 'Camera stopped'}
            </div>
            <button className="secondary" onClick={goLive}>
              Go to live detection <ArrowRight size={15} />
            </button>
          </div>
        </main>
      )}

      {page === 'About' && (
        <main className="wrap page-main">
          <PageHeading
            eyebrow="ABOUT THE PROJECT"
            title="Technology for safer journeys"
            subtitle="A student-built AI/ML prototype that explores eye-state classification and driver drowsiness warnings."
          />

          <div className="about-grid">
            <section className="panel about-copy">
              <h2>Project overview</h2>
              <p>
                DriveSafe AI combines a trained image classifier with computer
                vision to estimate whether the driver's eyes appear open or
                closed. When both eyes are classified as closed for a sustained
                interval, the system presents an alert.
              </p>

              <h3>Objectives</h3>
              <ul className="check-list">
                <li><CheckCircle2 /> Build and evaluate a dataset-based image classifier.</li>
                <li><CheckCircle2 /> Demonstrate webcam-to-model integration.</li>
                <li><CheckCircle2 /> Display a warning for sustained eye closure.</li>
                <li><CheckCircle2 /> Explain limitations and test results transparently.</li>
              </ul>
            </section>

            <section className="panel tech-panel">
              <h2>Technology stack</h2>
              <div className="tech-list">
                {[
                  ['Python', 'Training and backend'],
                  ['TensorFlow / Keras', 'CNN image classifier'],
                  ['OpenCV', 'Image processing'],
                  ['MediaPipe', 'Face and eye landmarks'],
                  ['Flask', 'Backend API'],
                  ['React + Vite', 'Website interface'],
                ].map(([a, b]) => (
                  <div className="tech-item" key={a}>
                    <span className="tech-bullet" />
                    <span>
                      <b>{a}</b>
                      <small>{b}</small>
                    </span>
                  </div>
                ))}
              </div>

              <div className="future-box">
                <b>Future scope</b>
                <p>
                  Yawning detection, longer-term session reports, improved
                  low-light performance and testing on diverse subjects.
                </p>
              </div>
            </section>
          </div>

          <div className="disclaimer about-disclaimer">
            <AlertTriangle size={16} /> Academic prototype only. It is not a
            certified driver-monitoring or medical system.
          </div>
        </main>
      )}

      <footer className="footer">
        <div className="wrap footer-inner">
          <Brand />
          <span>Student AIML Mini Project · DriveSafe AI</span>
          <span className="footer-note">
            <ShieldCheck size={14} /> Built for learning and road-safety awareness
          </span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="feature">
      <div className="feature-icon">{icon}</div>
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Step({ n, title, text }) {
  return (
    <div className="step-card">
      <span>{n}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="live-metric">
      <span className="live-metric-icon">{icon}</span>
      <span className="live-metric-label">{label}</span>
      <b className={value === 'closed' ? 'bad-text' : value === 'open' ? 'good-text' : ''}>
        {value}
      </b>
    </div>
  );
}

export default App;
