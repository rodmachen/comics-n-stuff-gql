# SQL Table Data

## stddata_country
- id, code, name

## stddata_language
- id, code, name, native_name

## stddata_date
- id, year, month, day, year_uncertain, month_uncertain, day_uncertain

## stddata_script
- id, code, number, name

## gcd_story_type
- id, name, sort_code

## gcd_reprint
- id, origin_id, target_id, notes, created, modified, origin_issue_id, target_issue_id

## gcd_brand_emblem_group
- id, brand_id, brandgroup_id

## gcd_brand_use
- id, publisher_id, emblem_id, year_began, year_ended, year_began_uncertain, year_ended_uncertain, notes, created, modified

## gcd_series_bond
- id, origin_id, target_id, origin_issue_id, target_issue_id, bond_type_id, notes, reserved

## gcd_series_bond_type
- id, name, description, notes

## gcd_series_publication_type
- id, name, notes

## taggit_tag
- id, name, slug

## taggit_taggeditem
- id, tag_id, object_id, content_type_id

## django_content_type
- id, app_label, model

## gcd_name_type
- id, description, type

## gcd_relation_type
- id, type, reverse_type

## gcd_school
- id, school_name

## gcd_degree
- id, degree_name

## gcd_membership_type
- id, type

## gcd_non_comic_work_role
- id, role_name

## gcd_non_comic_work_type
- id, type

## gcd_non_comic_work_year
- id, work_year, work_year_uncertain, non_comic_work_id

## gcd_feature_type
- id, name

## gcd_feature_relation_type
- id, name, description, reverse_description

## gcd_feature_logo_2_feature
- id, featurelogo_id, feature_id

## gcd_credit_type
- id, name, sort_code

## gcd_story_feature_logo
- id, story_id, featurelogo_id

## gcd_story_feature_object
- id, story_id, feature_id

## gcd_biblio_entry
- story_ptr_id, page_began, page_ended, abstract, doi

## gcd_creator_relation_creator_name
- id, creatorrelation_id, creatornamedetail_id

## gcd_creator_signature
- id, created, modified, deleted, name, notes, generic, creator_id

## gcd_feature_relation
- id, created, modified, notes, from_feature_id, relation_type_id, to_feature_id

## gcd_issue_indicia_printer
- id, issue_id, indiciaprinter_id

## gcd_character_relation
- id, created, modified, notes, from_character_id, relation_type_id, to_character_id

## gcd_character_relation_type
- id, type, reverse_type

## gcd_group_relation
- id, created, modified, notes, from_group_id, relation_type_id, to_group_id

## gcd_group_relation_type
- id, type, reverse_type

## gcd_group_membership
- id, created, modified, year_joined, year_joined_uncertain, year_left, year_left_uncertain, notes, character_id, group_id, membership_type_id

## gcd_group_membership_type
- id, type, reverse_type

## gcd_character_role
- id, name, sort_code

## gcd_story_character_group
- id, storycharacter_id, group_id

## gcd_story_universe
- id, story_id, universe_id

## gcd_issue_brand_emblem
- id, issue_id, brand_id

## gcd_publisher
- id, name, country_id, year_began, year_ended, notes, url, brand_count, indicia_publisher_count, series_count, created, modified, issue_count, deleted, year_began_uncertain, year_ended_uncertain, year_overall_began, year_overall_began_uncertain, year_overall_ended, year_overall_ended_uncertain

## gcd_brand_group
- id, name, year_began, year_ended, year_began_uncertain, year_ended_uncertain, notes, url, created, modified, deleted, parent_id, issue_count, year_overall_began, year_overall_began_uncertain, year_overall_ended, year_overall_ended_uncertain

## gcd_brand
- id, name, year_began, year_ended, notes, url, issue_count, created, modified, deleted, year_began_uncertain, year_ended_uncertain, year_overall_began, year_overall_began_uncertain, year_overall_ended, year_overall_ended_uncertain, generic

## gcd_indicia_publisher
- id, name, parent_id, country_id, year_began, year_ended, is_surrogate, notes, url, issue_count, created, modified, deleted, year_began_uncertain, year_ended_uncertain, year_overall_began, year_overall_began_uncertain, year_overall_ended, year_overall_ended_uncertain

## gcd_series
- id, name, sort_name, format, year_began, year_began_uncertain, year_ended, year_ended_uncertain, publication_dates, first_issue_id, last_issue_id, is_current, publisher_id, country_id, language_id, tracking_notes, notes, has_gallery, issue_count, created, modified, deleted, has_indicia_frequency, has_isbn, has_barcode, has_issue_title, has_volume, is_comics_publication, color, dimensions, paper_stock, binding, publishing_format, has_rating, publication_type_id, is_singleton, has_about_comics, has_indicia_printer, has_publisher_code_number

## gcd_issue
- id, number, volume, no_volume, display_volume_with_number, series_id, indicia_publisher_id, indicia_pub_not_printed, brand_id, no_brand, publication_date, key_date, sort_code, price, page_count, page_count_uncertain, indicia_frequency, no_indicia_frequency, editing, no_editing, notes, created, modified, deleted, is_indexed, isbn, valid_isbn, no_isbn, variant_of_id, variant_name, barcode, no_barcode, title, no_title, on_sale_date, on_sale_date_uncertain, rating, no_rating, volume_not_printed, indicia_printer_not_printed, variant_cover_status, indicia_printer_sourced_by

## gcd_story
- id, title, title_inferred, feature, sequence_number, page_count, issue_id, script, pencils, inks, colors, letters, editing, genre, characters, synopsis, reprint_notes, created, modified, notes, no_script, no_pencils, no_inks, no_colors, no_letters, no_editing, page_count_uncertain, type_id, job_number, deleted, first_line

## gcd_story_credit
- id, created, modified, deleted, is_credited, is_signed, uncertain, signed_as, credited_as, credit_name, creator_id, credit_type_id, story_id, signature_id, is_sourced, sourced_by

## gcd_feature
- id, created, modified, deleted, name, sort_name, genre, year_first_published, year_first_published_uncertain, notes, feature_type_id, language_id, disambiguation

## gcd_award
- id, name, created, deleted, modified, notes

## gcd_received_award
- id, created, modified, deleted, object_id, award_name, no_award_name, award_year, award_year_uncertain, notes, award_id, content_type_id

## gcd_creator
- id, gcd_official_name, whos_who, birth_country_uncertain, birth_province, birth_province_uncertain, birth_city, birth_city_uncertain, death_country_uncertain, death_province, death_province_uncertain, death_city, death_city_uncertain, bio, notes, created, modified, deleted, birth_country_id, birth_date_id, death_country_id, death_date_id, sort_name, disambiguation

## gcd_creator_art_influence
- id, influence_name, notes, created, modified, deleted, creator_id, influence_link_id

## gcd_creator_degree
- id, degree_year, degree_year_uncertain, notes, created, modified, deleted, creator_id, degree_id, school_id

## gcd_creator_membership
- id, organization_name, membership_year_began, membership_year_began_uncertain, membership_year_ended, membership_year_ended_uncertain, notes, created, modified, deleted, creator_id, membership_type_id

## gcd_creator_name_detail
- id, name, created, modified, deleted, creator_id, type_id, sort_name, is_official_name, in_script_id, family_name, given_name

## gcd_creator_non_comic_work
- id, publication_title, employer_name, work_title, work_urls, notes, created, modified, deleted, creator_id, work_role_id, work_type_id

## gcd_creator_relation
- id, notes, created, modified, deleted, from_creator_id, relation_type_id, to_creator_id

## gcd_creator_school
- id, school_year_began, school_year_began_uncertain, school_year_ended, school_year_ended_uncertain, notes, created, modified, deleted, creator_id, school_id

## gcd_feature_logo
- id, created, modified, deleted, name, sort_name, year_began, year_ended, year_began_uncertain, year_ended_uncertain, notes, generic

## gcd_indicia_printer
- id, created, modified, deleted, name, year_began, year_ended, year_began_uncertain, year_ended_uncertain, year_overall_began, year_overall_ended, year_overall_began_uncertain, year_overall_ended_uncertain, notes, url, issue_count, country_id, parent_id

## gcd_issue_credit
- id, created, modified, deleted, is_credited, uncertain, credited_as, credit_name, creator_id, credit_type_id, issue_id, is_sourced, sourced_by

## gcd_printer
- id, created, modified, deleted, name, year_began, year_ended, year_began_uncertain, year_ended_uncertain, year_overall_began, year_overall_ended, year_overall_began_uncertain, year_overall_ended_uncertain, notes, url, indicia_printer_count, issue_count, country_id

## gcd_character_name_detail
- id, created, modified, deleted, name, sort_name, character_id, is_official_name

## gcd_character
- id, created, modified, deleted, name, sort_name, disambiguation, year_first_published, year_first_published_uncertain, description, notes, language_id, universe_id

## gcd_group
- id, created, modified, deleted, name, sort_name, disambiguation, year_first_published, year_first_published_uncertain, description, notes, language_id, universe_id

## gcd_universe
- id, created, modified, deleted, multiverse, name, designation, year_first_published, year_first_published_uncertain, description, notes, verse_id

## gcd_multiverse
- id, created, modified, deleted, name, mainstream_id

## gcd_group_name_detail
- id, created, modified, deleted, name, sort_name, is_official_name, group_id

## gcd_story_character
- id, created, modified, deleted, is_flashback, is_origin, is_death, notes, character_id, role_id, story_id, universe_id, group_universe_id

## gcd_group_character
- id, created, modified, deleted, notes, story_id, universe_id, group_name_id
