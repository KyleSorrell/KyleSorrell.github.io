const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onDocumentCreated} = require("firebase-functions/firestore");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

const EMAILJS_SERVICE_ID = "service_qjt49i4";
const EMAILJS_LESSON_REQUEST_TEMPLATE = "template_sjocyhw";
const EMAILJS_LESSON_RESULT_TEMPLATE = "template_c1jb6qq";
const EMAILJS_PUBLIC_KEY = "IA_nnwX8_TyVgF09H";

// Store lesson request in Firestore and email Jake
exports.submitLessonRequest = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(400).send("Only POST requests allowed");
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
    const confirmLink = `${process.env.WEBSITE_URL || "https://kylesorrell.github.io"}/confirm.html?id=${requestId}&action=confirm`;
    const denyLink = `${process.env.WEBSITE_URL || "https://kylesorrell.github.io"}/confirm.html?id=${requestId}&action=deny`;

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
    res.status(500).send("Error submitting request");
  }
});

// Process Jake's confirmation/denial
exports.processLessonDecision = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(400).send("Only POST requests allowed");
  }

  try {
    const {requestId, action} = req.body;

    if (!requestId || !action) {
      return res.status(400).send("Missing requestId or action");
    }

    if (!["confirm", "deny"].includes(action)) {
      return res.status(400).send("Action must be 'confirm' or 'deny'");
    }

    // Get the lesson request
    const docRef = db.collection("lesson_requests").doc(requestId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send("Lesson request not found");
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
    res.status(500).send("Error processing decision");
  }
});
