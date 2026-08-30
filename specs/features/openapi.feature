Feature: OpenAPI Contract

  Scenario: The contract is published without authentication
    Given the API is running
    When an unauthenticated client GETs /api/v1/openapi.json
    Then the response status is 200
    And the response Content-Type is application/json

  Scenario: The published document is a valid OpenAPI 3.1 contract
    When a client fetches the OpenAPI document
    Then it validates as a well-formed OpenAPI 3.1 document
    And its paths match the API's actual registered routes

  Scenario: Internal endpoints are excluded from the contract
    Given the API registers internal routes under /api/v1/internal
    When a client fetches the OpenAPI document
    Then no /api/v1/internal path appears in it

  Scenario: Protected endpoints declare the bearer JWT requirement
    Given a route that requires "Authorization: Bearer <jwt>", such as GET /api/v1/auth/me
    When a client fetches the OpenAPI document
    Then that path declares a bearerAuth security requirement

  Scenario: Public endpoints declare no auth requirement
    Given a route open to anonymous callers, such as GET /api/v1/wars
    When a client fetches the OpenAPI document
    Then that path declares no security requirement

  Scenario: The refresh endpoint's response schema declares the JWT
    When a client fetches the OpenAPI document
    Then the POST /api/v1/auth/refresh 200 response schema requires a "token" string field

  Scenario: The voter profile endpoint's response schema declares the voter fields
    When a client fetches the OpenAPI document
    Then the GET /api/v1/auth/me 200 response schema requires "voter.id"
    And it declares "voter.avatar_url" nullable

  Scenario: The session logout endpoint declares no response body
    When a client fetches the OpenAPI document
    Then the DELETE /api/v1/auth/session 204 response declares no body

  Scenario: The callback endpoint's error responses declare a message
    When a client fetches the OpenAPI document
    Then the GET /api/v1/auth/{provider}/callback 400 response schema requires "error"

  Scenario: The wars list response schema is an array under a wars key
    When a client fetches the OpenAPI document
    Then the GET /api/v1/wars 200 response schema declares "wars" as an array
    And each item requires "id", "title", and "status"

  Scenario: The war detail response schema nests contestants with media
    When a client fetches the OpenAPI document
    Then the GET /api/v1/wars/{id} 200 response schema requires "contestants" as an array
    And each contestant requires "media" as an array

  Scenario: The join endpoint declares its success and failure shapes
    When a client fetches the OpenAPI document
    Then the POST /api/v1/wars/{id}/join 204 response declares no body
    And its 403 and 404 responses each require "error"

  Scenario: The next-matchup endpoint's response schema declares progress as numbers
    When a client fetches the OpenAPI document
    Then the GET /api/v1/wars/{id}/matchups/next 200 response schema requires "progress.voted" and "progress.total" as numbers
    And its 204 response declares no body

  Scenario: The vote endpoint's request body schema requires the winner
    When a client fetches the OpenAPI document
    Then the POST /api/v1/wars/{id}/matchups/{mId}/vote request body schema requires "winner_id"

  Scenario: The vote endpoint's response schemas cover its status variations
    When a client fetches the OpenAPI document
    Then its 201 response schema requires "vote_id"
    And its 409 response schema requires "error"
    And its 422 response schema requires "error"
