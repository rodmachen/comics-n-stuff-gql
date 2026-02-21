export const typeDefs = `#graphql
  # ─── Reference / Lookup Types ──────────────────────────────────────────────

  type Country {
    id: Int!
    code: String!
    name: String!
    publishers: [Publisher!]!
    series: [Series!]!
  }

  type Language {
    id: Int!
    code: String!
    name: String!
    nativeName: String!
    series: [Series!]!
  }

  type StoryType {
    id: Int!
    name: String!
    sortCode: Int!
  }

  type CreditType {
    id: Int!
    name: String!
    sortCode: Int!
  }

  type SeriesPublicationType {
    id: Int!
    name: String!
    notes: String!
  }

  # ─── Core Domain Types ────────────────────────────────────────────────────

  type Publisher {
    id: Int!
    name: String!
    yearBegan: Int
    yearEnded: Int
    notes: String!
    url: String!
    country: Country!
    series(limit: Int, offset: Int): [Series!]!
  }

  type Series {
    id: Int!
    name: String!
    sortName: String!
    format: String!
    yearBegan: Int!
    yearEnded: Int
    publicationDates: String!
    issueCount: Int!
    color: String!
    dimensions: String!
    binding: String!
    publishingFormat: String!
    publisher: Publisher!
    country: Country!
    language: Language!
    publicationType: SeriesPublicationType
    issues(limit: Int, offset: Int): [Issue!]!
  }

  type Issue {
    id: Int!
    number: String!
    volume: String!
    title: String!
    publicationDate: String!
    keyDate: String!
    price: String!
    pageCount: Float
    isbn: String!
    barcode: String!
    onSaleDate: String!
    rating: String!
    variantName: String!
    editing: String!
    notes: String!
    sortCode: Int!
    series: Series!
    variantOf: Issue
    stories(limit: Int, offset: Int): [Story!]!
  }

  type Story {
    id: Int!
    title: String!
    feature: String!
    sequenceNumber: Int!
    pageCount: Float
    script: String!
    pencils: String!
    inks: String!
    colors: String!
    letters: String!
    editing: String!
    genre: String!
    characters: String!
    synopsis: String!
    firstLine: String!
    jobNumber: String!
    issue: Issue!
    type: StoryType!
    credits: [StoryCredit!]!
  }

  type StoryCredit {
    id: Int!
    isCredited: Boolean!
    isSigned: Boolean!
    uncertain: Boolean!
    signedAs: String!
    creditedAs: String!
    creditName: String!
    creatorNameDetail: CreatorNameDetail!
    creditType: CreditType!
    story: Story!
  }

  type Creator {
    id: Int!
    gcdOfficialName: String!
    sortName: String!
    birthCity: String!
    birthProvince: String!
    deathCity: String!
    deathProvince: String!
    bio: String!
    notes: String!
    disambiguation: String!
    birthCountry: Country
    deathCountry: Country
    nameDetails: [CreatorNameDetail!]!
  }

  type CreatorNameDetail {
    id: Int!
    name: String!
    sortName: String!
    isOfficialName: Boolean!
    familyName: String!
    givenName: String!
    creator: Creator!
  }

  # ─── Connection Types (paginated lists with totalCount) ───────────────────

  type PublisherConnection {
    items: [Publisher!]!
    totalCount: Int!
  }

  type SeriesConnection {
    items: [Series!]!
    totalCount: Int!
  }

  type IssueConnection {
    items: [Issue!]!
    totalCount: Int!
  }

  type StoryConnection {
    items: [Story!]!
    totalCount: Int!
  }

  type CreatorConnection {
    items: [Creator!]!
    totalCount: Int!
  }

  # ─── Queries ──────────────────────────────────────────────────────────────

  type Query {
    # Publishers
    publishers(limit: Int, offset: Int, search: String): PublisherConnection!
    publisher(id: Int!): Publisher

    # Series
    allSeries(limit: Int, offset: Int, search: String, publisherId: Int): SeriesConnection!
    series(id: Int!): Series

    # Issues
    searchIssues(search: String!, issueNumber: String!, limit: Int, offset: Int): IssueConnection!
    issues(limit: Int, offset: Int, seriesId: Int, issueNumber: String, keyDate: String, onSaleDate: String): IssueConnection!
    issue(id: Int!): Issue

    # Stories
    stories(limit: Int, offset: Int, issueId: Int): StoryConnection!
    story(id: Int!): Story

    # Creators
    creators(limit: Int, offset: Int, search: String): CreatorConnection!
    creator(id: Int!): Creator

    # Reference types
    countries: [Country!]!
    languages: [Language!]!
    storyTypes: [StoryType!]!
    creditTypes: [CreditType!]!
    seriesPublicationTypes: [SeriesPublicationType!]!
  }
`;
