Feature: War Expiry

  Scenario: An expired War reports as closed before the close task runs
    Given an active War whose ends_at passed one minute ago
    And the close-expired-wars task has not yet run
    When anyone GETs /api/v1/wars/:id
    Then the response status field is "closed"

  Scenario: Voting is rejected the moment a War expires
    Given an active War whose ends_at passed one second ago
    And the close-expired-wars task has not yet run
    When a joined voter POSTs a vote
    Then the response status is 403

  Scenario: A War with no end date never expires
    Given an active War with ends_at set to NULL
    When the close-expired-wars task runs
    Then the War remains "active"

  Scenario: The close task materialises the stored status
    Given an active War whose ends_at passed six hours ago
    When the close-expired-wars task runs
    Then the stored status column becomes "closed"
    And the response reports 1 War closed

  Scenario: The close task is idempotent
    Given the close-expired-wars task has already closed all expired Wars
    When it runs again
    Then zero Wars are modified
    And the response status is 200

  Scenario: Internal endpoints reject a missing or wrong token
    When POST /api/v1/internal/close-expired-wars is called without a valid X-Internal-Token
    Then the response status is 401
    And no War records are modified

  Scenario: Internal endpoints do not accept user JWTs
    Given a valid user JWT for any voter
    When POST /api/v1/internal/close-expired-wars is called with that JWT and no internal token
    Then the response status is 401
