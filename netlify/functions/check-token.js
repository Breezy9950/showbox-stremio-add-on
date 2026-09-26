const MIN_TOKEN_LENGTH = 101;

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        usable: false,
        message: "Method not allowed.",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const token =
      typeof body.token === "string"
        ? body.token.trim()
        : "";

    if (!token) {
      return response({
        usable: false,
        message: "Cookie is required.",
      });
    }

    // Cookie must be longer than 100 characters.
    if (token.length < MIN_TOKEN_LENGTH) {
      return response({
        usable: false,
        message:
          "Cookie is too short. It must contain more than 100 characters.",
      });
    }

    // ShowBox JWT-style tokens begin with "eyJ".
    // If it looks like a JWT, make sure it has the
    // basic three-part header.payload.signature structure.
    if (token.startsWith("eyJ")) {
      const parts = token.split(".");

      if (parts.length !== 3) {
        return response({
          usable: false,
          message: "Invalid JWT format.",
        });
      }

      if (
        !parts[0] ||
        !parts[1] ||
        !parts[2]
      ) {
        return response({
          usable: false,
          message: "Invalid JWT format.",
        });
      }
    }

    return response({
      usable: true,
      message: "Cookie format looks valid.",
    });
  } catch {
    return response({
      usable: false,
      message: "Invalid request.",
    });
  }
}

export const config = {
  path: "/check-token",
};
