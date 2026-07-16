const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

const ALLOWED_ORIGINS = [
  "https://kylesorrell.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const isAllowed = ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  res.set("Access-Control-Allow-Origin", isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

const EMAILJS_SERVICE_ID = "service_qjt49i4";
const EMAILJS_LESSON_REQUEST_TEMPLATE = "template_sjocyhw";
const EMAILJS_LESSON_RESULT_TEMPLATE = "template_c1jb6qq";
const EMAILJS_PUBLIC_KEY = "IA_nnwX8_TyVgF09H";

// Fetch a lesson request by ID (used by confirm.html)
exports.getLessonRequest = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const requestId = req.query.id;
    if (!requestId) return res.status(400).json({error: "Missing id"});

    const doc = await db.collection("lesson_requests").doc(requestId).get();
    if (!doc.exists) return res.status(404).json({error: "Not found"});

    const data = doc.data();
    res.json({
      full_name: data.full_name,
      email: data.email,
      lesson_date: data.lesson_date,
      time_slot: data.time_slot,
      tail_number: data.tail_number,
      status: data.status,
    });
  } catch (error) {
    logger.error("Error getting lesson request:", error);
    res.status(500).json({error: "Error getting request"});
  }
});

// Store lesson request in Firestore and email Jake
exports.submitLessonRequest = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const {full_name, email, lesson_date, time_slot, tail_number} = req.body;

    if (!full_name || !email || !lesson_date || !time_slot || !tail_number) {
      return res.status(400).send("Missing required fields");
    }

    // Create unique request ID
    const requestId = db.collection("lesson_requests").doc().id;

    // Store in Firestore
    await db.collection("lesson_requests").doc(requestId).set({
      full_name,
      email,
      lesson_date,
      time_slot,
      tail_number,
      status: "pending",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send email to Jake with confirmation/denial links
    const base = process.env.WEBSITE_URL || "https://kylesorrell.github.io";
    const confirmLink = `${base}/confirm.html?id=${requestId}&action=confirm`;
    const denyLink = `${base}/confirm.html?id=${requestId}&action=deny`;

    const emailData = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_LESSON_REQUEST_TEMPLATE,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        full_name,
        email,
        lesson_date,
        time_slot,
        tail_number,
        confirmation_link: confirmLink,
        deny_link: denyLink,
      },
    };

    const fetch = require("node-fetch");
    const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(emailData),
    });

    if (!emailResponse.ok) {
      throw new Error(`EmailJS error: ${emailResponse.statusText}`);
    }

    logger.info(`Lesson request submitted: ${requestId}`);
    res.json({success: true, requestId});
  } catch (error) {
    logger.error("Error submitting lesson request:", error);
    res.status(500).json({error: "Error submitting request"});
  }
});

// Process Jake's confirmation/denial
exports.processLessonDecision = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const {requestId, action} = req.body;

    if (!requestId || !action) {
      return res.status(400).json({error: "Missing requestId or action"});
    }

    if (!["confirm", "deny"].includes(action)) {
      return res.status(400).json({error: "Action must be 'confirm' or 'deny'"});
    }

    // Get the lesson request
    const docRef = db.collection("lesson_requests").doc(requestId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({error: "Lesson request not found"});
    }

    const data = doc.data();

    // Update status
    await docRef.update({
      status: action === "confirm" ? "confirmed" : "denied",
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send result email to client
    const resultMessage = action === "confirm"
      ? "Your flight lesson has been confirmed! See you soon!"
      : "Unfortunately, this time slot is no longer available. Please visit the website to book another time.";

    const emailData = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_LESSON_RESULT_TEMPLATE,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        full_name: data.full_name,
        email: data.email,
        lesson_date: data.lesson_date,
        time_slot: data.time_slot,
        tail_number: data.tail_number,
        result_message: resultMessage,
      },
    };

    const fetch = require("node-fetch");
    const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(emailData),
    });

    if (!emailResponse.ok) {
      throw new Error(`EmailJS error: ${emailResponse.statusText}`);
    }

    logger.info(`Lesson request ${action}ed: ${requestId}`);
    res.json({success: true, action});
  } catch (error) {
    logger.error("Error processing lesson decision:", error);
    res.status(500).json({error: "Error processing decision"});
  }
});
