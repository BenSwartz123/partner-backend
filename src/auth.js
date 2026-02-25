/*
  AUTHENTICATION MIDDLEWARE
  ==========================
  
  KEY CONCEPT: Middleware
  
  In Express, middleware is a function that runs BEFORE your route
  handler. It can:
  1. Check if the user is logged in
  2. Add data to the request object
  3. Reject the request if something is wrong
  
  Think of it like a bouncer at a club -- they check your ID
  before letting you in.
  
  KEY CONCEPT: JWT (JSON Web Tokens)
  
  When a user logs in, we create a JWT -- a signed string that
  contains their user ID and role. The frontend stores this token
  and sends it with every request in the Authorization header.
  
  The flow:
  1. User logs in with email + password
  2. Server verifies credentials, creates a JWT
  3. Frontend stores the JWT
  4. Frontend sends "Authorization: Bearer <token>" with every request
  5. This middleware decodes the token and attaches user info to req.user
  
  JWTs are SIGNED, not encrypted. Anyone can read the contents,
  but only the server can create valid ones (because only the server
  knows the secret key).
*/

const jwt = require("jsonwebtoken");

// In production, this would be in an environment variable (process.env.JWT_SECRET)
// NEVER commit a real secret to source code
const JWT_SECRET = "partner-dev-secret-change-in-production";

/*
  Creates a JWT containing the user's ID and role.
  Expires in 7 days -- after that, the user must log in again.
*/
function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/*
  MIDDLEWARE: requireAuth
  
  Attaches the user to req.user if the token is valid.
  Returns 401 Unauthorized if not.
  
  Usage in a route:
    app.get("/api/submissions", requireAuth, (req, res) => {
      // req.user is available here
    });
*/
function requireAuth(req, res, next) {
  // The token comes in the Authorization header: "Bearer eyJhbG..."
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Extract the token (everything after "Bearer ")
  const token = authHeader.split(" ")[1];

  try {
    // jwt.verify() decodes the token AND checks the signature
    // If the token was tampered with or expired, it throws an error
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to the request so route handlers can use it
    req.user = decoded; // { id: 1, role: "founder" }
    next(); // Continue to the route handler
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/*
  MIDDLEWARE: requireRole
  
  Checks that the logged-in user has the required role.
  Must be used AFTER requireAuth.
  
  Usage:
    app.get("/api/dashboard", requireAuth, requireRole("board"), handler);
*/
function requireRole(role) {
  return (req, res, next) => {
    // Admin can access all roles
    if (req.user.role === "admin") return next();
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access restricted to ${role} members` });
    }
    next();
  };
}

module.exports = { JWT_SECRET, createToken, requireAuth, requireRole };
