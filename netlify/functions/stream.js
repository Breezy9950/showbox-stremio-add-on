export default async (req, context) => {
  const { type, id, config } = context.params;

  let uiToken = null;

  try {
    const base64 = config
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const json = atob(base64);
    const parsed = JSON.parse(json);

    uiToken = parsed.uiToken || null;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Invalid addon configuration"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  return new Response(
    JSON.stringify({
      streams: [
        {
          name: "ShowBox Config Test",
          title: `Token received: ${uiToken}`,
          url: "https://example.com/test"
        }
      ]
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
};

export const config = {
  path: "/:config/stream/:type/:id.json"
};
