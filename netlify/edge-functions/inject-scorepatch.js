export default async (request, context) => {
  const response = await context.next();
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;
  const text = await response.text();
  if (text.includes("/scorepatch.js")) return new Response(text, response);
  const modified = text.replace("</body>", '<script src="/scorepatch.js"></script></body>');
  const h = new Headers(response.headers);
  h.delete("content-length");
  return new Response(modified, { status: response.status, headers: h });
};
