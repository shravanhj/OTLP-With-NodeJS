// server.js
require('./otel');

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { trace, metrics } = require('@opentelemetry/api');

const app = express();
app.use(cors());
app.use(express.json());

const meter = metrics.getMeter('email-meter');
const emailCounter = meter.createCounter('emails_sent_total', {
  description: 'Count of emails sent',
});

app.use((req, res, next) => {
  const tracer = trace.getTracer('express-tracer');
  const span = tracer.startSpan(`${req.method} ${req.path}`);
  req.otelSpan = span;

  span.setAttribute('http.method', req.method);
  span.setAttribute('http.route', req.path);
  span.setAttribute('http.user_agent', req.headers['user-agent'] || '');

  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'object') {
        // stringify nested objects or arrays
        try {
          span.setAttribute(`http.request.body.${key}`, JSON.stringify(value));
        } catch {
          span.setAttribute(`http.request.body.${key}`, '[unserializable]');
        }
      } else {
        span.setAttribute(`http.request.body.${key}`, String(value));
      }
    }
  }

  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);
    span.end();
  });

  next();
});


// ===== Nodemailer Transporter (hardcoded) =====
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'shravan.hj.matrex@gmail.com',
    pass: 'lhsb pqvr cern sgrs', // HARD-CODED (not for prod)
  },
});

// ===== Email API Endpoint =====
app.post('/api/send-email', async (req, res) => {
  const { to, subject, html } = req.body;

  try {
    const info = await transporter.sendMail({
      from: 'shravan.hj.matrex@gmail.com',
      to,
      subject,
      html,
    });

    emailCounter.add(1, { status: 'success' });

    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    emailCounter.add(1, { status: 'failure' });

    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== Server Startup =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
