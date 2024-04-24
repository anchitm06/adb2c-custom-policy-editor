import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TechnicalprofileComponent } from './technicalprofile.component';

describe('TechnicalprofileComponent', () => {
  let component: TechnicalprofileComponent;
  let fixture: ComponentFixture<TechnicalprofileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TechnicalprofileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TechnicalprofileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
