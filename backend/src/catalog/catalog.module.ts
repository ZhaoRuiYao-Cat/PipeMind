import { Module } from "@nestjs/common";
import { ApiCatalogController } from "./api-catalog.controller.js";

@Module({
  controllers: [ApiCatalogController],
})
export class CatalogModule {}
