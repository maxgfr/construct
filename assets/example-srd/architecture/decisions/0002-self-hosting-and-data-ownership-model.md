# 0002. Self-hosting and data-ownership model

- **Status:** accepted

## Context
The value proposition is data ownership: users are leaving hosted read-it-later services precisely because those services lock data in or shut down.

## Decision
Ship self-hosted only for the MVP: no hosted multi-tenant offering, no account on any Readpile-operated server [E1]. [E1]

## Consequences
Removes all multi-tenancy, billing and abuse-handling work from the MVP, which is what makes 8 weeks credible. It also caps adoption to people who can run docker-compose — accepted deliberately, and the reason the install path is a first-class usability requirement.

## Alternatives considered
A hosted tier alongside self-hosting — contradicts the stated non-goal and roughly doubles the MVP surface.
