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
