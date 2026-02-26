/*
  API ROUTES
  ===========
  
  This file defines every endpoint (URL) that the frontend can call.
  
  KEY CONCEPT: REST API Design
  
  REST is a convention for organizing API endpoints:
  
  GET    /api/things       = List all things
  GET    /api/things/:id   = Get one thing
  POST   /api/things       = Create a new thing
  PUT    /api/things/:id   = Update a thing
  PATCH  /api/things/:id   = Partially update a thing
  DELETE /api/things/:id   = Delete a thing
  
  The HTTP method (GET/POST/PUT/DELETE) tells you the ACTION.
  The URL path tells you the RESOURCE.
  
  KEY CONCEPT: Request/Response Cycle
  
  1. Frontend sends an HTTP request (method + URL + body)
  2. Express matches the URL to a route handler
  3. Middleware runs first (auth checks, etc.)
  4. Route handler runs the database query
  5. Route handler sends back a JSON response
  
  Every route handler receives (req, res):
  - req.body    = data sent by the frontend (POST/PUT)
  - req.params  = URL parameters (like :id in /api/submissions/:id)
  - req.query   = URL query string (?status=new&industry=FinTech)
  - req.user    = the logged-in user (set by requireAuth middleware)
  - res.json()  = send a JSON response
  - res.status() = set the HTTP status code
*/

const express = require("express");
const bcrypt = require("bcryptjs");
const { createToken, requireAuth, requireRole } = require("./auth");
const email = require("./email");

function createRoutes(db) {
  const router = express.Router();

  // ===========================================================
  // AUTH ROUTES
  // ===========================================================

  /*
    POST /api/auth/register
    
    Creates a new founder account.
    Board members are added by admins, not self-service.
    
    Request body: { name, email, password }
    Response: { user, token }
  */
  router.post("/auth/register", (req, res) => {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check if email already exists
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Hash the password (never store plain text!)
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert the new user
    const result = db.prepare(
      "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, 'founder')"
    ).run(email.toLowerCase(), hashedPassword, name);

    const user = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    const token = createToken(user);

    res.status(201).json({ user, token });
  });

  /*
    POST /api/auth/login
    
    Authenticates a user and returns a JWT token.
    
    KEY CONCEPT: Timing-Safe Comparison
    
    bcrypt.compareSync() compares the plain password against the hash.
    It's designed to take the same amount of time whether the password
    is right or wrong, which prevents "timing attacks" where an attacker
    measures response time to guess passwords.
    
    Request body: { email, password }
    Response: { user, token }
  */
  router.post("/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.password)) {
      // Same error message for both cases -- don't reveal whether
      // the email exists (prevents email enumeration attacks)
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createToken(user);

    // Return user info WITHOUT the password hash
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  /*
    GET /api/auth/me
    
    Returns the currently logged-in user's profile.
    The frontend calls this on page load to check if the
    stored token is still valid.
  */
  router.get("/auth/me", requireAuth, (req, res) => {
    const user = db.prepare(
      "SELECT id, email, name, role, specialty, bio, linkedin, website, location, created_at FROM users WHERE id = ?"
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  });

  // ===========================================================
  // PROFILE ROUTES
  // ===========================================================

  /*
    PUT /api/profile
    
    Updates the logged-in user's profile.
    Only the fields that are sent will be updated.
    
    KEY CONCEPT: Partial Updates
    
    We build the SQL query dynamically based on which fields
    are present in the request body. This prevents overwriting
    fields that weren't sent.
  */
  router.put("/profile", requireAuth, (req, res) => {
    const { name, bio, linkedin, website, location } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (bio !== undefined) { updates.push("bio = ?"); values.push(bio); }
    if (linkedin !== undefined) { updates.push("linkedin = ?"); values.push(linkedin); }
    if (website !== undefined) { updates.push("website = ?"); values.push(website); }
    if (location !== undefined) { updates.push("location = ?"); values.push(location); }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const user = db.prepare(
      "SELECT id, email, name, role, specialty, bio, linkedin, website, location FROM users WHERE id = ?"
    ).get(req.user.id);

    res.json({ user });
  });

  // ===========================================================
  // SUBMISSION ROUTES
  // ===========================================================

  /*
    POST /api/submissions
    
    Creates a new submission. Only founders can do this.
    
    KEY CONCEPT: Role-Based Access Control (RBAC) in the backend
    
    The requireRole("founder") middleware runs BEFORE this handler.
    If the user isn't a founder, they get a 403 Forbidden response
    and this code never executes.
  */
  router.post("/submissions", requireAuth, requireRole("founder"), (req, res) => {
    const { companyName, oneLiner, industry, stage, teamSize, website, problem, solution, traction, lookingFor, fundingTarget, additionalNotes } = req.body;

    if (!companyName || !oneLiner || !industry || !stage || !problem || !solution || !traction || !lookingFor) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    // lookingFor comes as an array from the frontend, store as comma-separated
    const lookingForStr = Array.isArray(lookingFor) ? lookingFor.join(",") : lookingFor;

    const result = db.prepare(`
      INSERT INTO submissions (user_id, company_name, one_liner, industry, stage, team_size, website, problem, solution, traction, looking_for, funding_target, additional_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, companyName, oneLiner, industry, stage, teamSize || null, website || null, problem, solution, traction, lookingForStr, fundingTarget || null, additionalNotes || null);

    const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ submission });
  });

  /*
    GET /api/submissions
    
    Returns submissions based on the user's role:
    - Founders see only THEIR submissions
    - Board members see ALL submissions
    
    Supports filtering via query parameters:
    ?status=under_review&industry=FinTech&search=neural
    
    KEY CONCEPT: Dynamic SQL with Filters
    
    We build WHERE clauses based on query parameters. This is how
    search and filtering work on the backend.
  */
  router.get("/submissions", requireAuth, (req, res) => {
    const { status, industry, search } = req.query;
    const conditions = [];
    const values = [];

    // Role-based filtering
    if (req.user.role === "founder") {
      conditions.push("s.user_id = ?");
      values.push(req.user.id);
    }

    // Optional filters
    if (status && status !== "all") {
      conditions.push("s.status = ?");
      values.push(status);
    }
    if (industry && industry !== "all") {
      conditions.push("s.industry = ?");
      values.push(industry);
    }
    if (search) {
      conditions.push("(s.company_name LIKE ? OR s.one_liner LIKE ? OR s.industry LIKE ?)");
      const searchTerm = `%${search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const submissions = db.prepare(`
      SELECT s.*, u.name as founder_name
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.submitted_at DESC
    `).all(...values);

    // For each submission, fetch related data
    const enriched = submissions.map(sub => {
      // Board notes (founders only see founder_visible ones)
      const noteCondition = req.user.role === "founder" ? "AND bn.founder_visible = 1" : "";
      const notes = db.prepare(`
        SELECT bn.*, u.name as author_name
        FROM board_notes bn
        JOIN users u ON bn.user_id = u.id
        WHERE bn.submission_id = ? ${noteCondition}
        ORDER BY bn.created_at ASC
      `).all(sub.id);

      // Tagged members
      const tagged = db.prepare(`
        SELECT u.id, u.name, u.specialty
        FROM tagged_members tm
        JOIN users u ON tm.user_id = u.id
        WHERE tm.submission_id = ?
      `).all(sub.id);

      // Chat message count (board only)
      const chatCount = req.user.role === "board"
        ? db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE submission_id = ?").get(sub.id).count
        : 0;

      return {
        ...sub,
        looking_for: sub.looking_for ? sub.looking_for.split(",") : [],
        notes,
        tagged_members: tagged,
        chat_count: chatCount,
      };
    });

    res.json({ submissions: enriched });
  });

  /*
    GET /api/submissions/:id
    
    Returns a single submission with all its details.
    
    KEY CONCEPT: URL Parameters
    
    :id in the URL becomes req.params.id in the handler.
    So GET /api/submissions/42 means req.params.id === "42"
  */
  router.get("/submissions/:id", requireAuth, (req, res) => {
    const sub = db.prepare(`
      SELECT s.*, u.name as founder_name
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!sub) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Founders can only see their own submissions
    if (req.user.role === "founder" && sub.user_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const noteCondition = req.user.role === "founder" ? "AND bn.founder_visible = 1" : "";
    const notes = db.prepare(`
      SELECT bn.*, u.name as author_name
      FROM board_notes bn JOIN users u ON bn.user_id = u.id
      WHERE bn.submission_id = ? ${noteCondition}
      ORDER BY bn.created_at ASC
    `).all(sub.id);

    const tagged = db.prepare(`
      SELECT u.id, u.name, u.specialty
      FROM tagged_members tm JOIN users u ON tm.user_id = u.id
      WHERE tm.submission_id = ?
    `).all(sub.id);

    const chatMessages = (req.user.role === "board" || (req.user.role === "founder" && sub.user_id === req.user.id))
      ? db.prepare(`
          SELECT cm.*, u.name as author_name
          FROM chat_messages cm JOIN users u ON cm.user_id = u.id
          WHERE cm.submission_id = ?
          ORDER BY cm.created_at ASC
        `).all(sub.id)
      : [];

    const partnerships = db.prepare(`
      SELECT p.*, u.name as partner_name, u.specialty as partner_specialty
      FROM partnerships p JOIN users u ON p.user_id = u.id
      WHERE p.submission_id = ?
      ORDER BY p.created_at ASC
    `).all(sub.id);

    const meetingRequests = db.prepare(`
      SELECT mr.*, u.name as requester_name, u.specialty as requester_specialty
      FROM meeting_requests mr JOIN users u ON mr.user_id = u.id
      WHERE mr.submission_id = ?
      ORDER BY mr.created_at DESC
    `).all(sub.id);

    res.json({
      submission: {
        ...sub,
        looking_for: sub.looking_for ? sub.looking_for.split(",") : [],
        notes,
        tagged_members: tagged,
        chat_messages: chatMessages,
        partnerships,
        meeting_requests: meetingRequests,
      },
    });
  });

  /*
    PATCH /api/submissions/:id/status
    
    Updates a submission's status. Board members only.
    
    KEY CONCEPT: PATCH vs PUT
    
    PUT replaces the entire resource. PATCH updates specific fields.
    Changing just the status is a PATCH operation.
  */
  router.patch("/submissions/:id/status", requireAuth, requireRole("board"), (req, res) => {
    const { status } = req.body;
    const valid = ["new", "under_review", "more_info", "approved", "passed"];

    if (!valid.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    db.prepare("UPDATE submissions SET status = ? WHERE id = ?").run(status, req.params.id);

    // Email founder about status change
    const sub = db.prepare("SELECT company_name, user_id FROM submissions WHERE id = ?").get(req.params.id);
    if (sub) {
      const founder = db.prepare("SELECT name, email FROM users WHERE id = ?").get(sub.user_id);
      if (founder) {
        const tmpl = email.statusChangeEmail(founder.name, sub.company_name, status);
        email.sendEmail(founder.email, tmpl.subject, tmpl.html).catch(() => {});
      }
    }

    res.json({ success: true, status });
  });

  /*
    PATCH /api/submissions/:id/rating
    
    Sets a board member's rating on a submission.
  */
  router.patch("/submissions/:id/rating", requireAuth, requireRole("board"), (req, res) => {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    db.prepare("UPDATE submissions SET rating = ? WHERE id = ?").run(rating, req.params.id);
    res.json({ success: true, rating });
  });

  // ===========================================================
  // COLLABORATION ROUTES
  // ===========================================================

  /*
    POST /api/submissions/:id/notes
    
    Adds a board note to a submission.
  */
  router.post("/submissions/:id/notes", requireAuth, requireRole("board"), (req, res) => {
    const { text, founderVisible } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Note text is required" });
    }

    const result = db.prepare(
      "INSERT INTO board_notes (submission_id, user_id, text, founder_visible) VALUES (?, ?, ?, ?)"
    ).run(req.params.id, req.user.id, text, founderVisible ? 1 : 0);

    const note = db.prepare(`
      SELECT bn.*, u.name as author_name
      FROM board_notes bn JOIN users u ON bn.user_id = u.id
      WHERE bn.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ note });
  });

  /*
    POST /api/submissions/:id/tag
    
    Tags a board member on a submission.
    
    KEY CONCEPT: Idempotent Operations
    
    Using INSERT OR IGNORE means tagging someone who's already tagged
    is a no-op (does nothing). The UNIQUE constraint on (submission_id, user_id)
    prevents duplicates, and OR IGNORE means we don't throw an error.
  */
  router.post("/submissions/:id/tag", requireAuth, requireRole("board"), (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    db.prepare(
      "INSERT OR IGNORE INTO tagged_members (submission_id, user_id, tagged_by) VALUES (?, ?, ?)"
    ).run(req.params.id, userId, req.user.id);

    res.json({ success: true });
  });

  /*
    DELETE /api/submissions/:id/tag/:userId
    
    Removes a tag from a submission.
  */
  router.delete("/submissions/:id/tag/:userId", requireAuth, requireRole("board"), (req, res) => {
    db.prepare(
      "DELETE FROM tagged_members WHERE submission_id = ? AND user_id = ?"
    ).run(req.params.id, req.params.userId);

    res.json({ success: true });
  });

  /*
    POST /api/submissions/:id/chat
    
    Sends a message in a submission's discussion thread.
  */
  router.post("/submissions/:id/chat", requireAuth, (req, res) => {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text is required" });
    }

    // Board can chat on any submission, founders only on their own
    if (req.user.role === "founder") {
      const sub = db.prepare("SELECT user_id FROM submissions WHERE id = ?").get(req.params.id);
      if (!sub || sub.user_id !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const result = db.prepare(
      "INSERT INTO chat_messages (submission_id, user_id, text) VALUES (?, ?, ?)"
    ).run(req.params.id, req.user.id, text);

    const message = db.prepare(`
      SELECT cm.*, u.name as author_name
      FROM chat_messages cm JOIN users u ON cm.user_id = u.id
      WHERE cm.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message });
  });

  // ===========================================================
  // PARTNERSHIP ROUTES
  // ===========================================================

  /*
    POST /api/submissions/:id/partner
    
    Board member claims a Partner spot on a submission.
    Max 3 partners per submission.
  */
  router.post("/submissions/:id/partner", requireAuth, requireRole("board"), (req, res) => {
    const subId = req.params.id;

    // Check submission exists
    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(subId);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    // Check if already partnered
    const existing = db.prepare(
      "SELECT id FROM partnerships WHERE submission_id = ? AND user_id = ?"
    ).get(subId, req.user.id);
    if (existing) return res.status(409).json({ error: "You have already requested to partner" });

    // Check max 3 active partners (pending or accepted)
    const count = db.prepare(
      "SELECT COUNT(*) as count FROM partnerships WHERE submission_id = ? AND status IN ('pending', 'accepted')"
    ).get(subId).count;
    if (count >= 3) return res.status(400).json({ error: "Maximum 3 partners reached for this submission" });

    const result = db.prepare(
      "INSERT INTO partnerships (submission_id, user_id) VALUES (?, ?)"
    ).run(subId, req.user.id);

    const partnership = db.prepare(`
      SELECT p.*, u.name as partner_name, u.specialty as partner_specialty
      FROM partnerships p JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).get(result.lastInsertRowid);

    // Email founder about new partner request
    const founder = db.prepare("SELECT name, email FROM users WHERE id = ?").get(sub.user_id);
    if (founder) {
      const tmpl = email.partnerRequestEmail(founder.name, partnership.partner_name, partnership.partner_specialty, sub.company_name);
      email.sendEmail(founder.email, tmpl.subject, tmpl.html).catch(() => {});
    }

    res.status(201).json({ partnership });
  });

  /*
    DELETE /api/submissions/:id/partner
    
    Board member withdraws their partner request (only if still pending).
  */
  router.delete("/submissions/:id/partner", requireAuth, requireRole("board"), (req, res) => {
    const result = db.prepare(
      "DELETE FROM partnerships WHERE submission_id = ? AND user_id = ? AND status = 'pending'"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(400).json({ error: "No pending partnership to withdraw" });
    }
    res.json({ success: true });
  });

  /*
    GET /api/submissions/:id/partners
    
    Get all partner requests for a submission.
    Board sees all. Founder sees only for their own submissions.
  */
  router.get("/submissions/:id/partners", requireAuth, (req, res) => {
    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    // Founders can only see partners for their own submissions
    if (req.user.role === "founder" && sub.user_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const partners = db.prepare(`
      SELECT p.*, u.name as partner_name, u.specialty as partner_specialty
      FROM partnerships p JOIN users u ON p.user_id = u.id
      WHERE p.submission_id = ?
      ORDER BY p.created_at ASC
    `).all(req.params.id);

    res.json({ partners });
  });

  /*
    PATCH /api/partnerships/:id/respond
    
    Founder accepts or declines a partnership request.
  */
  router.patch("/partnerships/:id/respond", requireAuth, requireRole("founder"), (req, res) => {
    const { response } = req.body;
    if (!["accepted", "declined"].includes(response)) {
      return res.status(400).json({ error: "Response must be 'accepted' or 'declined'" });
    }

    // Verify this partnership belongs to the founder's submission
    const partnership = db.prepare(`
      SELECT p.*, s.user_id as founder_id
      FROM partnerships p
      JOIN submissions s ON p.submission_id = s.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!partnership) return res.status(404).json({ error: "Partnership not found" });
    if (partnership.founder_id !== req.user.id) return res.status(403).json({ error: "Access denied" });
    if (partnership.status !== "pending") return res.status(400).json({ error: "Partnership already responded to" });

    db.prepare(
      "UPDATE partnerships SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(response, req.params.id);

    // Email board member about the response
    const boardMember = db.prepare("SELECT name, email FROM users WHERE id = ?").get(partnership.user_id);
    const founderUser = db.prepare("SELECT name FROM users WHERE id = ?").get(req.user.id);
    const sub = db.prepare("SELECT company_name FROM submissions WHERE id = ?").get(partnership.submission_id);
    if (boardMember && founderUser && sub) {
      const tmpl = email.partnerResponseEmail(boardMember.name, founderUser.name, sub.company_name, response === "accepted");
      email.sendEmail(boardMember.email, tmpl.subject, tmpl.html).catch(() => {});
    }

    res.json({ success: true, status: response });
  });

  // ===========================================================
  // MEETING REQUEST ROUTES
  // ===========================================================

  /*
    POST /api/submissions/:id/meeting
    
    Board member requests a meeting with the founder.
    Creates a meeting request AND posts a chat message.
  */
  router.post("/submissions/:id/meeting", requireAuth, requireRole("board"), (req, res) => {
    const { message } = req.body;
    const subId = req.params.id;

    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(subId);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    const meetingMsg = message || "I'd like to schedule a meeting to discuss your submission.";

    // Create the meeting request record
    const result = db.prepare(
      "INSERT INTO meeting_requests (submission_id, user_id, message) VALUES (?, ?, ?)"
    ).run(subId, req.user.id, meetingMsg);

    // Also post it as a chat message so the founder sees it
    const boardUser = db.prepare("SELECT name FROM users WHERE id = ?").get(req.user.id);
    const chatText = `[Meeting Request] ${boardUser.name} would like to meet: "${meetingMsg}"`;
    
    db.prepare(
      "INSERT INTO chat_messages (submission_id, user_id, text) VALUES (?, ?, ?)"
    ).run(subId, req.user.id, chatText);

    const meetingRequest = db.prepare(`
      SELECT mr.*, u.name as requester_name, u.specialty as requester_specialty
      FROM meeting_requests mr JOIN users u ON mr.user_id = u.id
      WHERE mr.id = ?
    `).get(result.lastInsertRowid);

    // Email founder about meeting request
    const founder = db.prepare("SELECT name, email FROM users WHERE id = ?").get(sub.user_id);
    if (founder) {
      const tmpl = email.meetingRequestEmail(founder.name, meetingRequest.requester_name, meetingRequest.requester_specialty, sub.company_name, meetingMsg);
      email.sendEmail(founder.email, tmpl.subject, tmpl.html).catch(() => {});
    }

    res.status(201).json({ meetingRequest });
  });

  /*
    GET /api/my/partnerships
    
    Founder gets all partnership requests across their submissions.
  */
  router.get("/my/partnerships", requireAuth, requireRole("founder"), (req, res) => {
    const partnerships = db.prepare(`
      SELECT p.*, u.name as partner_name, u.specialty as partner_specialty,
             s.company_name, s.one_liner, s.id as submission_id
      FROM partnerships p
      JOIN users u ON p.user_id = u.id
      JOIN submissions s ON p.submission_id = s.id
      WHERE s.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);

    res.json({ partnerships });
  });

  /*
    GET /api/my/meetings
    
    Founder gets all meeting requests across their submissions.
  */
  router.get("/my/meetings", requireAuth, requireRole("founder"), (req, res) => {
    const meetings = db.prepare(`
      SELECT mr.*, u.name as requester_name, u.specialty as requester_specialty,
             s.company_name, s.id as submission_id
      FROM meeting_requests mr
      JOIN users u ON mr.user_id = u.id
      JOIN submissions s ON mr.submission_id = s.id
      WHERE s.user_id = ?
      ORDER BY mr.created_at DESC
    `).all(req.user.id);

    res.json({ meetings });
  });

  // ===========================================================
  // PARTNERSHIP WORKSPACE ROUTES
  // ===========================================================

  /*
    GET /api/active-partnerships
    
    Returns submissions with accepted partnerships.
    Founders see their own startups. Board members see ones they're partnered on.
  */
  router.get("/active-partnerships", requireAuth, (req, res) => {
    let subs;
    if (req.user.role === "founder") {
      subs = db.prepare(`
        SELECT DISTINCT s.* FROM submissions s
        JOIN partnerships p ON p.submission_id = s.id
        WHERE s.user_id = ? AND p.status = 'accepted'
      `).all(req.user.id);
    } else {
      subs = db.prepare(`
        SELECT DISTINCT s.* FROM submissions s
        JOIN partnerships p ON p.submission_id = s.id
        WHERE p.user_id = ? AND p.status = 'accepted'
      `).all(req.user.id);
    }

    // Enrich each submission with its accepted partners
    const enriched = subs.map(s => {
      const partners = db.prepare(`
        SELECT p.*, u.name as partner_name, u.specialty as partner_specialty
        FROM partnerships p JOIN users u ON p.user_id = u.id
        WHERE p.submission_id = ? AND p.status = 'accepted'
      `).all(s.id);
      const founder = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(s.user_id);
      return { ...s, partners, founder };
    });

    res.json({ partnerships: enriched });
  });

  /*
    GET /api/submissions/:id/partnership-chat
    
    Gets partnership chat messages. Only accessible by founder or accepted partners.
  */
  router.get("/submissions/:id/partnership-chat", requireAuth, (req, res) => {
    const subId = req.params.id;
    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(subId);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    // Check access: must be founder or accepted partner
    const isFounder = req.user.role === "founder" && sub.user_id === req.user.id;
    const isPartner = db.prepare(
      "SELECT id FROM partnerships WHERE submission_id = ? AND user_id = ? AND status = 'accepted'"
    ).get(subId, req.user.id);
    if (!isFounder && !isPartner) return res.status(403).json({ error: "Access denied" });

    const messages = db.prepare(`
      SELECT pm.*, u.name as author_name, u.role as author_role
      FROM partnership_messages pm JOIN users u ON pm.user_id = u.id
      WHERE pm.submission_id = ?
      ORDER BY pm.created_at ASC
    `).all(subId);

    const links = db.prepare(`
      SELECT sl.*, u.name as author_name
      FROM shared_links sl JOIN users u ON sl.user_id = u.id
      WHERE sl.submission_id = ?
      ORDER BY sl.created_at DESC
    `).all(subId);

    res.json({ messages, links });
  });

  /*
    POST /api/submissions/:id/partnership-chat
    
    Sends a message in the partnership chat.
  */
  router.post("/submissions/:id/partnership-chat", requireAuth, (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Message text is required" });

    const subId = req.params.id;
    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(subId);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    const isFounder = req.user.role === "founder" && sub.user_id === req.user.id;
    const isPartner = db.prepare(
      "SELECT id FROM partnerships WHERE submission_id = ? AND user_id = ? AND status = 'accepted'"
    ).get(subId, req.user.id);
    if (!isFounder && !isPartner) return res.status(403).json({ error: "Access denied" });

    const result = db.prepare(
      "INSERT INTO partnership_messages (submission_id, user_id, text) VALUES (?, ?, ?)"
    ).run(subId, req.user.id, text);

    const message = db.prepare(`
      SELECT pm.*, u.name as author_name, u.role as author_role
      FROM partnership_messages pm JOIN users u ON pm.user_id = u.id
      WHERE pm.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message });
  });

  /*
    POST /api/submissions/:id/shared-links
    
    Adds a shared link/document URL.
  */
  router.post("/submissions/:id/shared-links", requireAuth, (req, res) => {
    const { url, title } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: "URL is required" });

    const subId = req.params.id;
    const sub = db.prepare("SELECT * FROM submissions WHERE id = ?").get(subId);
    if (!sub) return res.status(404).json({ error: "Submission not found" });

    const isFounder = req.user.role === "founder" && sub.user_id === req.user.id;
    const isPartner = db.prepare(
      "SELECT id FROM partnerships WHERE submission_id = ? AND user_id = ? AND status = 'accepted'"
    ).get(subId, req.user.id);
    if (!isFounder && !isPartner) return res.status(403).json({ error: "Access denied" });

    const result = db.prepare(
      "INSERT INTO shared_links (submission_id, user_id, url, title) VALUES (?, ?, ?, ?)"
    ).run(subId, req.user.id, url, title || null);

    const link = db.prepare(`
      SELECT sl.*, u.name as author_name
      FROM shared_links sl JOIN users u ON sl.user_id = u.id
      WHERE sl.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ link });
  });

  // ===========================================================
  // ANALYTICS ROUTES (Board only)
  // ===========================================================

  /*
    GET /api/analytics
    
    Returns computed stats for the analytics dashboard.
    
    KEY CONCEPT: Aggregate Queries
    
    SQL can compute stats directly with functions like COUNT(),
    AVG(), and GROUP BY. This is much faster than fetching all
    rows and computing in JavaScript.
  */
  router.get("/analytics", requireAuth, requireRole("board"), (req, res) => {
    const total = db.prepare("SELECT COUNT(*) as count FROM submissions").get().count;
    const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM submissions GROUP BY status").all();
    const byIndustry = db.prepare("SELECT industry, COUNT(*) as count FROM submissions GROUP BY industry ORDER BY count DESC").all();
    const byStage = db.prepare("SELECT stage, COUNT(*) as count FROM submissions GROUP BY stage").all();
    const avgRating = db.prepare("SELECT AVG(rating) as avg FROM submissions WHERE rating IS NOT NULL").get().avg;
    const approved = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'approved'").get().count;
    const passed = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'passed'").get().count;

    // Weekly submission volume (last 8 weeks)
    const weeklyVolume = db.prepare(`
      SELECT 
        strftime('%Y-%W', submitted_at) as week,
        COUNT(*) as count
      FROM submissions
      WHERE submitted_at >= date('now', '-56 days')
      GROUP BY week
      ORDER BY week ASC
    `).all();

    // Rating distribution
    const ratingDist = db.prepare(`
      SELECT rating, COUNT(*) as count
      FROM submissions
      WHERE rating IS NOT NULL
      GROUP BY rating
      ORDER BY rating ASC
    `).all();

    // Top rated submissions
    const topRated = db.prepare(`
      SELECT s.company_name, s.industry, s.stage, s.rating
      FROM submissions s
      WHERE s.rating IS NOT NULL
      ORDER BY s.rating DESC
      LIMIT 6
    `).all();

    res.json({
      total,
      byStatus,
      byIndustry,
      byStage,
      avgRating: avgRating ? avgRating.toFixed(1) : "N/A",
      approvalRate: (approved + passed) > 0 ? Math.round((approved / (approved + passed)) * 100) : 0,
      weeklyVolume,
      ratingDist,
      topRated,
    });
  });

  // ===========================================================
  // ADMIN ROUTES
  // ===========================================================

  /*
    POST /api/admin/board-members
    Create a new board member account. Admin only.
  */
  router.post("/admin/board-members", requireAuth, requireRole("admin"), (req, res) => {
    const { name, email, password, specialty } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password required" });

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: "Email already exists" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      "INSERT INTO users (email, password, name, role, specialty) VALUES (?, ?, ?, 'board', ?)"
    ).run(email.toLowerCase(), hashedPassword, name, specialty || null);

    const user = db.prepare("SELECT id, email, name, role, specialty FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ user });
  });

  /*
    DELETE /api/admin/board-members/:id
    Remove a board member. Admin only.
  */
  router.delete("/admin/board-members/:id", requireAuth, requireRole("admin"), (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'board'").get(req.params.id);
    if (!user) return res.status(404).json({ error: "Board member not found" });
    db.prepare("DELETE FROM users WHERE id = ? AND role = 'board'").run(req.params.id);
    res.json({ success: true });
  });

  /*
    GET /api/admin/all-board-members
    Get all board members with activity stats. Admin only.
  */
  router.get("/admin/all-board-members", requireAuth, requireRole("admin"), (req, res) => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, u.specialty, u.created_at,
        (SELECT COUNT(*) FROM board_notes WHERE user_id = u.id) as notes_count,
        (SELECT COUNT(*) FROM partnerships WHERE user_id = u.id) as partnerships_count,
        (SELECT COUNT(*) FROM partnerships WHERE user_id = u.id AND status = 'accepted') as accepted_partnerships,
        (SELECT COUNT(*) FROM chat_messages WHERE user_id = u.id) as messages_count
      FROM users u WHERE u.role = 'board'
      ORDER BY u.name
    `).all();
    res.json({ members });
  });

  /*
    GET /api/admin/analytics
    Full platform analytics. Admin only.
  */
  router.get("/admin/analytics", requireAuth, requireRole("admin"), (req, res) => {
    const total = db.prepare("SELECT COUNT(*) as count FROM submissions").get().count;
    const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM submissions GROUP BY status").all();
    const approved = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'approved'").get().count;
    const passed = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE status = 'passed'").get().count;
    const totalPartnerships = db.prepare("SELECT COUNT(*) as count FROM partnerships WHERE status = 'accepted'").get().count;
    const pendingPartnerships = db.prepare("SELECT COUNT(*) as count FROM partnerships WHERE status = 'pending'").get().count;
    const totalMeetings = db.prepare("SELECT COUNT(*) as count FROM meeting_requests").get().count;
    const totalFounders = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'founder'").get().count;
    const totalBoard = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'board'").get().count;

    // Board leaderboard
    const leaderboard = db.prepare(`
      SELECT u.id, u.name, u.specialty,
        (SELECT COUNT(*) FROM board_notes WHERE user_id = u.id) as notes,
        (SELECT COUNT(*) FROM partnerships WHERE user_id = u.id AND status = 'accepted') as deals,
        (SELECT COUNT(*) FROM chat_messages WHERE user_id = u.id) as messages,
        (SELECT COUNT(*) FROM meeting_requests WHERE user_id = u.id) as meetings
      FROM users u WHERE u.role = 'board'
      ORDER BY (
        (SELECT COUNT(*) FROM board_notes WHERE user_id = u.id) +
        (SELECT COUNT(*) FROM partnerships WHERE user_id = u.id AND status = 'accepted') * 5 +
        (SELECT COUNT(*) FROM meeting_requests WHERE user_id = u.id) * 3
      ) DESC
    `).all();

    // Recent activity
    const recentNotes = db.prepare(`
      SELECT bn.created_at, u.name as user_name, s.company_name, 'note' as type
      FROM board_notes bn
      JOIN users u ON bn.user_id = u.id
      JOIN submissions s ON bn.submission_id = s.id
      ORDER BY bn.created_at DESC LIMIT 5
    `).all();

    const recentPartnerships = db.prepare(`
      SELECT p.created_at, u.name as user_name, s.company_name, p.status, 'partnership' as type
      FROM partnerships p
      JOIN users u ON p.user_id = u.id
      JOIN submissions s ON p.submission_id = s.id
      ORDER BY p.created_at DESC LIMIT 5
    `).all();

    const recentMeetings = db.prepare(`
      SELECT mr.created_at, u.name as user_name, s.company_name, 'meeting' as type
      FROM meeting_requests mr
      JOIN users u ON mr.user_id = u.id
      JOIN submissions s ON mr.submission_id = s.id
      ORDER BY mr.created_at DESC LIMIT 5
    `).all();

    const activity = [...recentNotes, ...recentPartnerships, ...recentMeetings]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);

    res.json({
      total, byStatus, approved, passed, totalPartnerships, pendingPartnerships,
      totalMeetings, totalFounders, totalBoard, leaderboard, activity,
      approvalRate: (approved + passed) > 0 ? Math.round((approved / (approved + passed)) * 100) : 0,
    });
  });

  /*
    GET/PUT /api/admin/settings
    Platform settings. Admin only.
  */
  router.get("/admin/settings", requireAuth, requireRole("admin"), (req, res) => {
    const rows = db.prepare("SELECT key, value FROM platform_settings").all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json({ settings });
  });

  router.put("/admin/settings", requireAuth, requireRole("admin"), (req, res) => {
    const { settings } = req.body;
    if (!settings) return res.status(400).json({ error: "Settings object required" });
    Object.entries(settings).forEach(([key, value]) => {
      db.prepare("INSERT OR REPLACE INTO platform_settings (key, value) VALUES (?, ?)").run(key, String(value));
    });
    res.json({ success: true });
  });

  /*
    Board invitation suggestions (from board members)
  */
  router.post("/suggest-board-member", requireAuth, requireRole("board"), (req, res) => {
    const { name, email, reason } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email required" });
    db.prepare(
      "INSERT INTO board_invitations (suggested_by, name, email, reason) VALUES (?, ?, ?, ?)"
    ).run(req.user.id, name, email, reason || null);
    res.status(201).json({ success: true });
  });

  router.get("/admin/invitations", requireAuth, requireRole("admin"), (req, res) => {
    const invitations = db.prepare(`
      SELECT bi.*, u.name as suggested_by_name
      FROM board_invitations bi JOIN users u ON bi.suggested_by = u.id
      ORDER BY bi.created_at DESC
    `).all();
    res.json({ invitations });
  });

  router.patch("/admin/invitations/:id", requireAuth, requireRole("admin"), (req, res) => {
    const { status } = req.body;
    if (!["approved", "declined"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    db.prepare("UPDATE board_invitations SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true, status });
  });

  /*
    Admin messaging with board members
  */
  router.get("/admin/messages/:userId", requireAuth, requireRole("admin"), (req, res) => {
    const messages = db.prepare(`
      SELECT am.*, u.name as from_name, u.role as from_role
      FROM admin_messages am JOIN users u ON am.from_user_id = u.id
      WHERE (am.from_user_id = ? AND am.to_user_id = ?) OR (am.from_user_id = ? AND am.to_user_id = ?)
      ORDER BY am.created_at ASC
    `).all(req.user.id, req.params.userId, req.params.userId, req.user.id);
    res.json({ messages });
  });

  router.post("/admin/messages/:userId", requireAuth, requireRole("admin"), (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Message required" });
    const result = db.prepare(
      "INSERT INTO admin_messages (from_user_id, to_user_id, text) VALUES (?, ?, ?)"
    ).run(req.user.id, req.params.userId, text);
    const message = db.prepare(`
      SELECT am.*, u.name as from_name, u.role as from_role
      FROM admin_messages am JOIN users u ON am.from_user_id = u.id
      WHERE am.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ message });
  });

  /*
    GET /api/my/admin-messages
    Board member sees their messages with admin.
  */
  router.get("/my/admin-messages", requireAuth, requireRole("board"), (req, res) => {
    const messages = db.prepare(`
      SELECT am.*, u.name as from_name, u.role as from_role
      FROM admin_messages am JOIN users u ON am.from_user_id = u.id
      WHERE am.from_user_id = ? OR am.to_user_id = ?
      ORDER BY am.created_at ASC
    `).all(req.user.id, req.user.id);
    
    const admin = db.prepare("SELECT id, name FROM users WHERE role = 'admin' LIMIT 1").get();
    res.json({ messages, admin });
  });

  /*
    POST /api/my/admin-messages
    Board member replies to admin.
  */
  router.post("/my/admin-messages", requireAuth, requireRole("board"), (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Message required" });
    
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!admin) return res.status(404).json({ error: "No admin found" });

    const result = db.prepare(
      "INSERT INTO admin_messages (from_user_id, to_user_id, text) VALUES (?, ?, ?)"
    ).run(req.user.id, admin.id, text);

    const message = db.prepare(`
      SELECT am.*, u.name as from_name, u.role as from_role
      FROM admin_messages am JOIN users u ON am.from_user_id = u.id
      WHERE am.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ message });
  });

  // ===========================================================
  // BOARD MEMBERS LIST (for tagging UI)
  // ===========================================================

  router.get("/board-members", requireAuth, requireRole("board"), (req, res) => {
    const members = db.prepare(
      "SELECT id, name, specialty FROM users WHERE role = 'board'"
    ).all();
    res.json({ members });
  });

  return router;
}

module.exports = { createRoutes };
