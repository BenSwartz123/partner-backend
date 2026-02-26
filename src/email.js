/*
  EMAIL NOTIFICATIONS (SendGrid)
  ================================
  
  Sends transactional emails for key platform events.
  
  Uses SendGrid's v3 API directly via fetch (no SDK needed).
  This keeps dependencies minimal.
  
  Required environment variables:
  - SENDGRID_API_KEY: Your SendGrid API key
  - SENDGRID_FROM_EMAIL: Verified sender email
*/

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";
const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@partner.io";
const PLATFORM_NAME = "Partner";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://earnest-cat-737e09.netlify.app";

function isEnabled() {
  return !!API_KEY;
}

async function sendEmail(to, subject, htmlBody) {
  if (!isEnabled()) {
    console.log(`[Email] Skipped (no API key): "${subject}" -> ${to}`);
    return false;
  }

  try {
    const res = await fetch(SENDGRID_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: PLATFORM_NAME },
        subject: subject,
        content: [{ type: "text/html", value: htmlBody }],
      }),
    });

    if (res.status >= 200 && res.status < 300) {
      console.log(`[Email] Sent: "${subject}" -> ${to}`);
      return true;
    } else {
      const err = await res.text();
      console.error(`[Email] Failed (${res.status}): ${err}`);
      return false;
    }
  } catch (err) {
    console.error(`[Email] Error:`, err.message);
    return false;
  }
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================

function wrap(content) {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="margin-bottom: 32px;">
        <span style="font-size: 24px; font-weight: 800; color: #0F1B3D;">Partner</span>
      </div>
      ${content}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0;">
        <p style="font-size: 12px; color: #94A3B8; margin: 0;">
          This is an automated notification from ${PLATFORM_NAME}.<br/>
          <a href="${FRONTEND_URL}" style="color: #2563EB;">Open Partner</a>
        </p>
      </div>
    </div>
  `;
}

// Founder: Someone wants to partner with your startup
function partnerRequestEmail(founderName, boardMemberName, boardMemberSpecialty, companyName) {
  return {
    subject: `New partner request for ${companyName}`,
    html: wrap(`
      <h2 style="font-size: 20px; color: #0F1B3D; margin: 0 0 16px;">New Partner Request</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        Hi ${founderName},
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        <strong>${boardMemberName}</strong>${boardMemberSpecialty ? ` (${boardMemberSpecialty})` : ''} 
        wants to partner with <strong>${companyName}</strong>.
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 24px;">
        Log in to review and accept or decline this request.
      </p>
      <a href="${FRONTEND_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0F1B3D, #2563EB); color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Request
      </a>
    `),
  };
}

// Founder: Someone requested a meeting
function meetingRequestEmail(founderName, boardMemberName, boardMemberSpecialty, companyName, message) {
  return {
    subject: `Meeting request for ${companyName}`,
    html: wrap(`
      <h2 style="font-size: 20px; color: #0F1B3D; margin: 0 0 16px;">Meeting Request</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        Hi ${founderName},
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px;">
        <strong>${boardMemberName}</strong>${boardMemberSpecialty ? ` (${boardMemberSpecialty})` : ''} 
        would like to schedule a meeting about <strong>${companyName}</strong>.
      </p>
      ${message ? `
        <div style="background: #F0F5FF; border-left: 3px solid #2563EB; padding: 14px 18px; border-radius: 0 8px 8px 0; margin: 0 0 24px;">
          <p style="font-size: 14px; color: #334155; margin: 0; font-style: italic;">"${message}"</p>
        </div>
      ` : ''}
      <a href="${FRONTEND_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0F1B3D, #2563EB); color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Request
      </a>
    `),
  };
}

// Board member: Partner request accepted/declined
function partnerResponseEmail(boardMemberName, founderName, companyName, accepted) {
  return {
    subject: `Partner request ${accepted ? 'accepted' : 'declined'}: ${companyName}`,
    html: wrap(`
      <h2 style="font-size: 20px; color: #0F1B3D; margin: 0 0 16px;">
        Partner Request ${accepted ? 'Accepted' : 'Declined'}
      </h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        Hi ${boardMemberName},
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 24px;">
        ${accepted 
          ? `Great news! <strong>${founderName}</strong> has accepted your partner request for <strong>${companyName}</strong>. You can now collaborate in the Partnerships workspace.`
          : `<strong>${founderName}</strong> has declined your partner request for <strong>${companyName}</strong>.`
        }
      </p>
      <a href="${FRONTEND_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0F1B3D, #2563EB); color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        ${accepted ? 'Go to Partnerships' : 'Open Partner'}
      </a>
    `),
  };
}

// Founder: Submission status changed
function statusChangeEmail(founderName, companyName, newStatus) {
  const statusLabels = {
    under_review: "Under Review",
    more_info: "More Info Needed",
    approved: "Approved",
    passed: "Passed",
  };
  const label = statusLabels[newStatus] || newStatus;
  const isGood = newStatus === "approved";
  const color = isGood ? "#10B981" : newStatus === "passed" ? "#64748B" : "#2563EB";

  return {
    subject: `${companyName}: Status updated to ${label}`,
    html: wrap(`
      <h2 style="font-size: 20px; color: #0F1B3D; margin: 0 0 16px;">Submission Update</h2>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 20px;">
        Hi ${founderName},
      </p>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px;">
        The status of <strong>${companyName}</strong> has been updated:
      </p>
      <div style="display: inline-block; padding: 8px 20px; border-radius: 20px; background: ${color}15; color: ${color}; font-weight: 700; font-size: 15px; margin-bottom: 24px;">
        ${label}
      </div>
      <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 24px;">
        Log in to see details and any feedback from the board.
      </p>
      <a href="${FRONTEND_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0F1B3D, #2563EB); color: #FFF; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Submission
      </a>
    `),
  };
}

module.exports = {
  isEnabled,
  sendEmail,
  partnerRequestEmail,
  meetingRequestEmail,
  partnerResponseEmail,
  statusChangeEmail,
};
