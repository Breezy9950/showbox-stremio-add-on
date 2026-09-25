export default async (req, context) => {
  const { type, id, config } = context.params;

  return new Response(
    JSON.stringify({
      streams: [
        {
          name: "ShowBox Config Test",
          title: `Config: ${config} | ${type}: ${id}`,
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
