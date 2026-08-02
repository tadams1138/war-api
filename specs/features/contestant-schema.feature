Feature: Contestant Schema

  Scenario: A pageant and a primary use different fields with the same code
    Given a War declaring country, age, and height
    And another War declaring party, state, and office
    When contestants are fetched from each
    Then each returns its own fields resolved with labels and values

  Scenario: An attribute outside the schema is rejected
    Given a War whose schema declares only country
    When a contestant is created with an attribute keyed party
    Then the response status is 422

  Scenario: A mistyped attribute is rejected
    Given a schema declaring age as a number
    When a contestant is created with age set to "twenty-four"
    Then the response status is 422

  Scenario: A dangerous URL never reaches storage
    Given a schema declaring a field of type url
    When a contestant is created with a javascript: value for it
    Then the response status is 422
    And no contestant record is created

  Scenario: Omitted fields are permitted
    Given a schema declaring country, age, and height
    When a contestant is created supplying only country
    Then the contestant is created
    And only country is present in its resolved attributes

  Scenario: Attributes resolve in schema order
    Given a schema declaring country then age
    When a contestant supplies them in the opposite order
    Then the resolved attributes list country before age

  Scenario: The schema is fixed once a War is active
    Given an active War
    When its contestant_schema is modified
    Then the response status is 403
