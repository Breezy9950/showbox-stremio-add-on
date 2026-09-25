export default async (req, context) => {
  const { type, id } = context.params;

  return new Response(
    JSON.stringify({
      streams: [
        {
          name: "ShowBox Test",
          title: `Received ${type}: ${id}`,
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
  path: "/stream/:type/:id.json"
};
