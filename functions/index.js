const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

function setCors(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

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

    // Email is sent client-side via EmailJS after this response
    logger.info(`Lesson request submitted: ${requestId}`);
    res.json({success: true, requestId});
  } catch (error) {
    logger.error("Error submitting lesson request:", error);
    res.status(500).json({error: "Error submitting request"});
  }
});

const ADMIN_PIN = "2007";
function verifyAdmin(password) {
  return password === ADMIN_PIN;
}

// Return confirmed lesson slots + custom unavailable times (used by calendar + admin page)
exports.getUnavailableTimes = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const [confirmedSnap, customSnap] = await Promise.all([
      db.collection("lesson_requests").where("status", "==", "confirmed").get(),
      db.collection("unavailable_times").orderBy("created_at", "desc").get(),
    ]);

    const confirmed = confirmedSnap.docs.map((doc) => ({
      requestId: doc.id,
      full_name: doc.data().full_name,
      email: doc.data().email,
      date: doc.data().lesson_date,
      time_slot: doc.data().time_slot,
      tail_number: doc.data().tail_number,
    }));

    const custom = customSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      created_at: undefined, // strip Firestore timestamp (not serialisable)
    }));

    res.json({confirmed, custom});
  } catch (error) {
    logger.error("Error getting unavailable times:", error);
    res.status(500).json({error: "Error fetching data"});
  }
});

// Add a custom unavailable time (admin only)
exports.addUnavailableTime = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const {adminPassword, type, date, dayOfWeek, reason} = req.body;

    if (!verifyAdmin(adminPassword)) {
      return res.status(401).json({error: "Unauthorized"});
    }
    if (!["date", "recurring"].includes(type)) {
      return res.status(400).json({error: "type must be 'date' or 'recurring'"});
    }

    const data = {type, reason: reason || "", created_at: admin.firestore.FieldValue.serverTimestamp()};
    if (type === "date") data.date = date;
    if (type === "recurring") data.dayOfWeek = Number(dayOfWeek);

    const ref = await db.collection("unavailable_times").add(data);
    logger.info(`Unavailable time added: ${ref.id}`);
    res.json({success: true, id: ref.id});
  } catch (error) {
    logger.error("Error adding unavailable time:", error);
    res.status(500).json({error: "Error adding entry"});
  }
});

// Delete a custom unavailable time (admin only)
exports.deleteUnavailableTime = onRequest(async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const {adminPassword, id} = req.body;

    if (!verifyAdmin(adminPassword)) {
      return res.status(401).json({error: "Unauthorized"});
    }
    if (!id) return res.status(400).json({error: "Missing id"});

    await db.collection("unavailable_times").doc(id).delete();
    logger.info(`Unavailable time deleted: ${id}`);
    res.json({success: true});
  } catch (error) {
    logger.error("Error deleting unavailable time:", error);
    res.status(500).json({error: "Error deleting entry"});
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

    // Return student data so the browser can send the result email via EmailJS
    logger.info(`Lesson request ${action}ed: ${requestId}`);
    res.json({
      success: true,
      action,
      student: {
        full_name: data.full_name,
        email: data.email,
        lesson_date: data.lesson_date,
        time_slot: data.time_slot,
        tail_number: data.tail_number,
      },
    });
  } catch (error) {
    logger.error("Error processing lesson decision:", error);
    res.status(500).json({error: "Error processing decision"});
  }
});
