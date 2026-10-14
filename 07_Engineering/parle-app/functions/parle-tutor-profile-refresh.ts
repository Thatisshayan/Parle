// Retired worker kept as an inert endpoint. The marketplace refresh owns the hourly snapshot schedule.
Deno.serve(() => new Response("Not found", { status: 404 }));
