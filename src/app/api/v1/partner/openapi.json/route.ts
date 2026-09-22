// GET /api/v1/partner/openapi.json — OpenAPI 3.1 specification for Nexus Partner & Developer API (TPI-9)
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/utils";

export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "MYHitch Nexus Partner & Enterprise API",
      version: "1.0.0",
      description:
        "Official Developer & Partner API for MYHitch Nexus (TPI-9). Enables secure catalogue access, syndicated video embeds, client review workflows, and large file delivery.",
      contact: {
        name: "MYHitch Nexus Enterprise Support",
        url: `${SITE_URL}/contact`,
        email: "enterprise@myhitch.com",
      },
    },
    servers: [
      {
        url: SITE_URL,
        description: "Production API Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "nx_live_...",
          description: "Authenticate using a Nexus API key prefixed with `nx_live_`.",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Authenticate using the `X-API-Key` header with your `nx_live_...` key.",
        },
      },
      schemas: {
        PartnerVideo: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            synopsis: { type: "string", nullable: true },
            durationSeconds: { type: "integer" },
            thumbnailUrl: { type: "string", nullable: true },
            playbackUrl: { type: "string" },
            embedUrl: { type: "string" },
            category: { type: "string", nullable: true },
            publishedAt: { type: "string", format: "date-time", nullable: true },
          },
          required: ["id", "title", "durationSeconds", "playbackUrl", "embedUrl"],
        },
        CreateVideoRequest: {
          type: "object",
          properties: {
            title: { type: "string" },
            synopsis: { type: "string" },
            durationSeconds: { type: "integer" },
            externalId: { type: "string" },
            category: { type: "string" },
          },
          required: ["title"],
        },
        EmbedRequest: {
          type: "object",
          properties: {
            videoId: { type: "string" },
            allowedOrigins: {
              type: "array",
              items: { type: "string" },
              description: "Allowed origins for iframe embedding",
            },
            theme: { type: "string", enum: ["dark", "light"], default: "dark" },
            autoPlay: { type: "boolean", default: false },
          },
          required: ["videoId"],
        },
        EmbedResponse: {
          type: "object",
          properties: {
            videoId: { type: "string" },
            embedUrl: { type: "string" },
            iframeHtml: { type: "string" },
            expiresAt: { type: "string", format: "date-time", nullable: true },
          },
          required: ["videoId", "embedUrl", "iframeHtml"],
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
          required: ["error"],
        },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    paths: {
      "/api/v1/partner/videos": {
        get: {
          summary: "List Organization Videos",
          description: "Returns videos available to the partner with pagination and search.",
          operationId: "listVideos",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20, maximum: 100 },
              description: "Number of records to return",
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
              description: "Pagination offset",
            },
            {
              name: "search",
              in: "query",
              schema: { type: "string" },
              description: "Filter videos by title or description",
            },
          ],
          responses: {
            200: {
              description: "List of videos retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/PartnerVideo" },
                      },
                      total: { type: "integer" },
                      limit: { type: "integer" },
                      offset: { type: "integer" },
                    },
                    required: ["data", "total", "limit", "offset"],
                  },
                },
              },
            },
            401: {
              description: "Unauthorized - Invalid or missing API key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            403: {
              description: "Forbidden - Insufficient permissions (missing read:catalogue scope)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
        post: {
          summary: "Register Partner Video",
          description: "Creates or registers a new video draft under the partner organization.",
          operationId: "createVideo",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateVideoRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Video registered successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      video: { $ref: "#/components/schemas/PartnerVideo" },
                    },
                    required: ["video"],
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
            403: { description: "Forbidden - missing write:catalogue scope" },
          },
        },
      },
      "/api/v1/partner/embed": {
        post: {
          summary: "Generate Embed Player Markup",
          description: "Generates a signed embed URL and iframe snippet for syndicated playback.",
          operationId: "generateEmbed",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EmbedRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Embed snippet generated successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EmbedResponse" },
                },
              },
            },
            401: { description: "Unauthorized" },
            403: { description: "Forbidden - missing embed:player scope" },
            404: { description: "Video not found" },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}
