import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksGlobalArea extends Struct.ComponentSchema {
  collectionName: 'components_blocks_global_areas';
  info: {
    displayName: 'Global Area';
    icon: 'cog';
  };
  attributes: {
    Common: Schema.Attribute.Component<'elements.common', false>;
    Stacks: Schema.Attribute.Relation<
      'oneToOne',
      'api::stacks-and-global-area.stacks-and-global-area'
    >;
  };
}

export interface BlocksTestBlock extends Struct.ComponentSchema {
  collectionName: 'components_blocks_test_blocks';
  info: {
    displayName: 'Test Block';
    icon: 'landscape';
  };
  attributes: {
    Common: Schema.Attribute.Component<'elements.common', false>;
    Media: Schema.Attribute.Component<'elements.image-video-item', false>;
    Title: Schema.Attribute.String;
  };
}

export interface ElementsCommon extends Struct.ComponentSchema {
  collectionName: 'components_elements_commons';
  info: {
    displayName: 'Common';
    icon: 'cog';
  };
  attributes: {
    BlockID: Schema.Attribute.String;
    HideBlock: Schema.Attribute.Boolean;
    NoBottomSpace: Schema.Attribute.Boolean;
  };
}

export interface ElementsImageVideoItem extends Struct.ComponentSchema {
  collectionName: 'components_elements_image_video_items';
  info: {
    displayName: 'Image-Video Item';
    icon: 'bulletList';
  };
  attributes: {
    Description: Schema.Attribute.String;
    Image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    MobileImage: Schema.Attribute.Media<'images'>;
    MobileVideoURL: Schema.Attribute.String;
    VideoUrl: Schema.Attribute.String;
  };
}

export interface ElementsLink extends Struct.ComponentSchema {
  collectionName: 'components_elements_links';
  info: {
    displayName: 'Link';
    icon: 'link';
  };
  attributes: {
    Title: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<['internal', 'external']>;
    url: Schema.Attribute.String;
  };
}

export interface ElementsStickyCardsItem extends Struct.ComponentSchema {
  collectionName: 'components_elements_sticky_cards_items';
  info: {
    displayName: 'Card Item';
    icon: 'bulletList';
  };
  attributes: {
    Color: Schema.Attribute.Enumeration<
      ['RoseGold', 'Blue', 'DarkBlue', 'Orange']
    > &
      Schema.Attribute.DefaultTo<'RoseGold'>;
    Description: Schema.Attribute.Text;
    Image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    Text: Schema.Attribute.Text;
    Title: Schema.Attribute.String;
  };
}

export interface ElementsTeamItem extends Struct.ComponentSchema {
  collectionName: 'components_elements_team_items';
  info: {
    displayName: 'Team Item';
    icon: 'user';
  };
  attributes: {
    CalendarCode: Schema.Attribute.Text;
    Designation: Schema.Attribute.String;
    Email: Schema.Attribute.Email;
    Name: Schema.Attribute.String;
    PhoneNumber: Schema.Attribute.String;
    Profile: Schema.Attribute.Media<'images'>;
  };
}

export interface FooterLinksGroup extends Struct.ComponentSchema {
  collectionName: 'components_footer_links_groups';
  info: {
    displayName: 'Links group';
    icon: 'bulletList';
  };
  attributes: {
    HiddenOnMobile: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    Items: Schema.Attribute.Component<'elements.link', true>;
    link: Schema.Attribute.String;
    Title: Schema.Attribute.String;
  };
}

export interface FooterSocialLinks extends Struct.ComponentSchema {
  collectionName: 'components_footer_social_links';
  info: {
    displayName: 'Social Links';
    icon: 'twitter';
  };
  attributes: {
    SocialLinks: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-link.social-link'
    >;
    Title: Schema.Attribute.String;
  };
}

export interface GlobalConfig extends Struct.ComponentSchema {
  collectionName: 'components_global_configs';
  info: {
    displayName: 'Config';
    icon: 'lock';
  };
  attributes: {
    ConfigKey: Schema.Attribute.String;
    ConfigValue: Schema.Attribute.Text;
  };
}

export interface GlobalFormAfterSubmission extends Struct.ComponentSchema {
  collectionName: 'components_global_form_after_submissions';
  info: {
    displayName: 'Form After Submission';
    icon: 'link';
  };
  attributes: {
    Link: Schema.Attribute.String;
    Message: Schema.Attribute.Text;
    Type: Schema.Attribute.Enumeration<['message', 'link']>;
  };
}

export interface GlobalFormEmailTemplates extends Struct.ComponentSchema {
  collectionName: 'components_global_form_email_templates';
  info: {
    displayName: 'Form Email Templates';
    icon: 'envelop';
  };
  attributes: {
    EmailSubject: Schema.Attribute.String;
    Enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    RecipientEmail: Schema.Attribute.String;
    SenderEmail: Schema.Attribute.String;
  };
}

export interface GlobalFormFields extends Struct.ComponentSchema {
  collectionName: 'components_global_form_fields';
  info: {
    description: '';
    displayName: 'Form Fields';
    icon: 'bulletList';
  };
  attributes: {
    Label: Schema.Attribute.String;
    Mandatory: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    Placeholder: Schema.Attribute.String;
    SelectOptions: Schema.Attribute.Component<
      'global.form-select-options',
      true
    >;
    SubmissionKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    Type: Schema.Attribute.Enumeration<
      [
        'text',
        'number',
        'email',
        'textarea',
        'select',
        'upload',
        'checkbox',
        'radio',
        'hidden',
        'phone',
        'country',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'text'>;
    Validations: Schema.Attribute.Component<'global.form-validations', false>;
  };
}

export interface GlobalFormSelectOptions extends Struct.ComponentSchema {
  collectionName: 'components_global_form_select_options';
  info: {
    displayName: 'Form Select Options';
    icon: 'bulletList';
  };
  attributes: {
    Label: Schema.Attribute.String & Schema.Attribute.Required;
    SendToEmail: Schema.Attribute.String;
    Value: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface GlobalFormSubmissions extends Struct.ComponentSchema {
  collectionName: 'components_global_form_submissions';
  info: {
    description: '';
    displayName: 'Form Submissions';
    icon: 'information';
  };
  attributes: {
    Label: Schema.Attribute.String;
    SubmissionKey: Schema.Attribute.String;
    Type: Schema.Attribute.String;
    Value: Schema.Attribute.String;
  };
}

export interface GlobalFormValidations extends Struct.ComponentSchema {
  collectionName: 'components_global_form_validations';
  info: {
    displayName: 'Form Validations';
    icon: 'cursor';
  };
  attributes: {
    ErrorMessage: Schema.Attribute.String;
    MaxFiles: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<1>;
  };
}

export interface GlobalSeo extends Struct.ComponentSchema {
  collectionName: 'components_global_seos';
  info: {
    description: '';
    displayName: 'SEO';
    icon: 'dashboard';
  };
  attributes: {
    MetaDescription: Schema.Attribute.Text;
    MetaImage: Schema.Attribute.Media<'images'>;
    MetaRobots: Schema.Attribute.String;
    MetaTitle: Schema.Attribute.String;
    StructuredData: Schema.Attribute.JSON;
  };
}

export interface HomeHomePageConfig extends Struct.ComponentSchema {
  collectionName: 'components_home_home_page_configs';
  info: {
    displayName: 'Home Page Config';
    icon: 'apps';
  };
  attributes: {
    AboutBannerSubtitle: Schema.Attribute.Text;
    AboutBannerTitle: Schema.Attribute.Text;
    Description: Schema.Attribute.Text;
    Title: Schema.Attribute.Text;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'blocks.global-area': BlocksGlobalArea;
      'blocks.test-block': BlocksTestBlock;
      'elements.common': ElementsCommon;
      'elements.image-video-item': ElementsImageVideoItem;
      'elements.link': ElementsLink;
      'elements.sticky-cards-item': ElementsStickyCardsItem;
      'elements.team-item': ElementsTeamItem;
      'footer.links-group': FooterLinksGroup;
      'footer.social-links': FooterSocialLinks;
      'global.config': GlobalConfig;
      'global.form-after-submission': GlobalFormAfterSubmission;
      'global.form-email-templates': GlobalFormEmailTemplates;
      'global.form-fields': GlobalFormFields;
      'global.form-select-options': GlobalFormSelectOptions;
      'global.form-submissions': GlobalFormSubmissions;
      'global.form-validations': GlobalFormValidations;
      'global.seo': GlobalSeo;
      'home.home-page-config': HomeHomePageConfig;
    }
  }
}
