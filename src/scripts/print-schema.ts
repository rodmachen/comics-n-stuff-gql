import { buildSchema, printSchema } from "graphql";
import { typeDefs } from "../graphql/typeDefs/index.js";

const schema = buildSchema(typeDefs);
console.log(printSchema(schema));
