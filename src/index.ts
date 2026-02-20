import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import depthLimit from "graphql-depth-limit";
import { typeDefs } from "./graphql/typeDefs/index.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { createLoaders } from "./lib/loaders.js";
import { logger } from "./lib/logger.js";

const app = express();
const httpServer = http.createServer(app);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(15)],
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  formatError: (formattedError, error) => {
    if (formattedError.extensions?.code === "INTERNAL_SERVER_ERROR") {
      logger.error({ err: error }, "Internal server error in resolver");
      if (process.env.NODE_ENV === "production") {
        return {
          message: "An internal error occurred.",
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        };
      }
    }
    return formattedError;
  },
});

await server.start();

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : "*";

app.use(
  "/graphql",
  cors<cors.CorsRequest>({ origin: corsOrigins }),
  express.json(),
  expressMiddleware(server, {
    context: async () => ({ loaders: createLoaders() }),
  })
);

const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;

await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));
logger.info({ port }, `Server ready at http://localhost:${port}/graphql`);
