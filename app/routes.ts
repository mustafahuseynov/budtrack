import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("planning", "routes/planning.tsx"),
  route("savings", "routes/savings.tsx"),
  route("categories", "routes/categories.tsx"),
  route("tracking", "routes/tracking.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
] satisfies RouteConfig;
