Feature: Voting

  Scenario: Voter casts a vote
    Given a voter who joined an active War
    And matchup M has not been voted on by this voter
    When they POST /vote with a valid winner_id
    Then a Vote record is created
    And the winner's win_count increases by 1
    And both contestants' appearance_count increase by 1

  Scenario: A vote is final
    Given a voter who voted Contestant A in matchup M
    When they POST /vote for matchup M with winner_id = Contestant B
    Then the response status is 409
    And no new Vote record is created
    And no counters change

  Scenario: Re-submitting the same vote is treated as a retry
    Given a voter who voted Contestant A in matchup M
    When they POST /vote for matchup M with winner_id = Contestant A again
    Then the response status is 200
    And no new Vote record is created
    And no counters change

  Scenario: A pairing has no direction
    Given contestants A and B in an active War
    Then exactly one matchup exists for that pair
    And attempting to insert the mirrored pairing violates a constraint

  Scenario: A voter is never served a pair they have voted on
    Given a voter who has voted on matchup M
    When they request /matchups/next repeatedly until 204
    Then matchup M is never returned

  Scenario: Every pair is served before completion
    Given an active War with 4 contestants and therefore 6 pairs
    When a voter requests and votes until /matchups/next returns 204
    Then they have voted on all 6 pairs exactly once

  Scenario: Pair order is randomised but stable per voter
    Given two voters in the same active War
    Then the order pairs are served in differs between them
    And each voter's own order is identical across repeated requests

  Scenario: Pair selection favours the least-shown contestants
    Given an active War where contestant C has the lowest appearance_count
    When a voter requests /matchups/next
    And they have unvoted pairs both containing and not containing C
    Then the returned pair contains C

  Scenario: The displayed side is decided by the API and recorded
    Given a voter served matchup M
    Then the response names which contestant is left and which is right
    And the order is identical if the request is repeated
    When they vote
    Then presented_left_id is stored on the Vote record

  Scenario: The next matchup's media is offered for prefetch
    Given a voter with at least two pairs remaining
    When they request /matchups/next
    Then the response includes a prefetch block naming the following matchup's media

  Scenario: Abandoning produces no record
    Given a voter served matchup M who never votes on it
    When they leave the War
    Then no Vote record exists for matchup M
    And neither contestant's counters changed

  Scenario: Cannot vote on a closed War
    Given a War in "closed" status
    When a voter POSTs a vote
    Then the response status is 403

  Scenario: Non-joined voter cannot vote
    Given an active War
    And an authenticated voter who has not joined
    When they POST a vote
    Then the response status is 403
