Feature: Rankings

  Scenario: Anonymous user views public War rankings
    Given a public War in "active" status
    When an unauthenticated user GETs /wars/:id/rankings
    Then the response status is 200

  Scenario: Contestants are ranked by raw win count
    Given Contestant A has 320 wins and Contestant B has 300 wins
    When rankings are fetched
    Then Contestant A ranks above Contestant B

  Scenario: Ties are broken by fewer appearances
    Given Contestants A and B both have 50 wins
    And Contestant A has 60 appearances and Contestant B has 80
    When rankings are fetched
    Then Contestant A ranks above Contestant B

  Scenario: A high win rate on few showings does not top the board
    Given Contestant A has 3 wins from 3 appearances
    And Contestant B has 320 wins from 400 appearances
    When rankings are fetched
    Then Contestant B ranks above Contestant A

  Scenario: Contestants with no appearances are unranked
    Given Contestant C has an appearance_count of 0
    When rankings are fetched
    Then Contestant C appears at the bottom
    And its rank is null

  Scenario: Exposure stays balanced as a War progresses
    Given an active War that has received several hundred votes
    When contestants' appearance_counts are compared
    Then they are clustered within a narrow range

  Scenario: Rankings are cacheable for public Wars
    Given a public War
    When rankings are fetched
    Then the response sets Cache-Control public with max-age 30

  Scenario: Invite-only rankings are not stored in a shared cache
    Given an invite_only War
    When rankings are fetched by a member
    Then the response sets Cache-Control private

  Scenario: Invite-only War rankings blocked for anonymous users
    Given an invite_only War
    When an unauthenticated user GETs rankings
    Then the response status is 401
