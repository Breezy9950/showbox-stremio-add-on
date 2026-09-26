const MIN_TOKEN_LENGTH = 101;

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        status: "invalid",
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
      return new Response(
        JSON.stringify({
          status: "invalid",
          message: "Cookie is required.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (token.length <= MIN_TOKEN_LENGTH - 1) {
      return new Response(
        JSON.stringify({
          status: "invalid",
          message:
            "Cookie is too short. Enter a valid ShowBox cookie.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // If it looks like a JWT, perform a basic structural check.
    if (token.startsWith("eyJ")) {
      const parts = token.split(".");

      if (parts.length !== 3) {
        return new Response(
          JSON.stringify({
            status: "invalid",
            message: "Invalid JWT format.",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      for (const part of parts) {
        if (!part) {
          return new Response(
            JSON.stringify({
              status: "invalid",
              message: "Invalid JWT format.",
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "usable",
        message: "Cookie format looks valid.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({
        status: "invalid",
        message: "Invalid request.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export const config = {
  path: "/check-token",
};
