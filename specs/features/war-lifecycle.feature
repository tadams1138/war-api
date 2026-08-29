Feature: War Lifecycle

  Scenario: Creator activates a War with enough contestants
    Given a War in "draft" status with 3 contestants, each with an image
    When the creator POSTs to /api/v1/wars/:id/activate
    Then the War status becomes "active"
    And exactly 3 matchups are generated

  Scenario: Cannot activate with fewer than 2 contestants
    Given a War in "draft" with 1 contestant
    When the creator POSTs to activate
    Then the response status is 422
    And the War remains "draft"

  Scenario: Cannot edit after activation
    Given a War in "active" status
    When the creator PATCHes the title
    Then the response status is 403

  Scenario: Non-creator cannot activate
    Given a War created by Voter A
    When Voter B POSTs to activate
    Then the response status is 403

  Scenario: A voter joins an active War
    Given an active War
    And an authenticated voter who has not joined
    When they POST to /api/v1/wars/:id/join
    Then a war_membership record is created for that voter and War
