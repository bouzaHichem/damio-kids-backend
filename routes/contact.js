const express = require('express');
const rateLimit = require('express-rate-limit');
const emailService = require('../services/emailService');

const router = express.Router();

// Basic rate limit to protect from abuse
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});


function validate({ name, email, message }) {
  const errors = [];
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim();
  const trimmedMessage = String(message || '').trim();

  if (trimmedName.length < 2 || trimmedName.length > 100) errors.push('Invalid name');
  if (!/^\S+@\S+\.\S+$/.test(trimmedEmail) || trimmedEmail.length > 200) errors.push('Invalid email');
  if (trimmedMessage.length < 5 || trimmedMessage.length > 5000) errors.push('Invalid message');

  return { errors, data: { name: trimmedName, email: trimmedEmail, message: trimmedMessage } };
}

router.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { errors, data } = validate(req.body || {});
    if (errors.length) {
      return res.status(400).json({ success: false, errors });
    }

    const to = process.env.CONTACT_TO || process.env.ADMIN_EMAIL || 'damiokids25@gmail.com';
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || data.email;

    const subject = `New contact message from ${data.name}`;
    const text = `Name: ${data.name}\nEmail: ${data.email}\n\nMessage:\n${data.message}`;
    const html = `
      <h2>New Contact Message</h2>
      <p><b>Name:</b> ${data.name}</p>
      <p><b>Email:</b> ${data.email}</p>
      <p><b>Message:</b></p>
      <p>${data.message.replace(/\n/g, '<br/>')}</p>
    `;

    const sent = await emailService.sendEmail({ to, from, subject, text, html, replyTo: data.email });
    if (!sent?.success) {
      return res.status(500).json({ success: false, error: sent?.error || 'Failed to send message' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Contact route error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

module.exports = router;