Feature: Image Processing

  Scenario: Uploaded images are re-encoded into variants
    Given a 10MB JPEG uploaded for a contestant
    When the upload completes
    Then WebP variants are stored at 400, 800, and 1600 pixels wide
    And the original is retained in a private prefix

  Scenario: EXIF metadata is stripped
    Given an uploaded photo containing GPS coordinates in its EXIF data
    When the variants are generated
    Then no EXIF metadata is present in any variant

  Scenario: Images are never upscaled
    Given an uploaded image 600 pixels wide
    When the variants are generated
    Then a 400px variant exists
    And no 800px or 1600px variant is produced

  Scenario: Originals are not publicly reachable
    Given a stored original image
    When it is requested through the public media path
    Then it is not served

  Scenario: Responses expose variants, not raw URLs
    Given a contestant with images
    When any endpoint returns that contestant
    Then each image includes a variants array with width and url

  Scenario: A contestant may hold up to ten images
    Given a contestant with ten images in a draft War
    When an eleventh image is uploaded
    Then the response status is 422
