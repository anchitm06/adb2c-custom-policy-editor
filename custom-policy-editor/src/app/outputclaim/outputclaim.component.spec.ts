import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutputclaimComponent } from './outputclaim.component';

describe('OutputclaimComponent', () => {
  let component: OutputclaimComponent;
  let fixture: ComponentFixture<OutputclaimComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutputclaimComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OutputclaimComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
